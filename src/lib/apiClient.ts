import { auth } from './firebase';
import type { PaymentGatewayStatus, PaymentMethod, PaymentOrderResult, PlanType } from '../types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchPaymentGatewayStatus(): Promise<PaymentGatewayStatus> {
  const res = await fetch('/api/payments/config-status');
  if (!res.ok) {
    throw new Error('Failed to check payment gateway configuration status.');
  }
  return (await res.json()) as PaymentGatewayStatus;
}

export async function createBackendPaymentOrder(params: {
  plan: PlanType;
  method: PaymentMethod;
  amountKhr: number;
  exchangeRateKhrPerUsd: number;
}): Promise<PaymentOrderResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as PaymentOrderResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not create payment order.');
  }
  return data;
}

export async function verifyBackendPayment(params: {
  orderRef: string;
  method: PaymentMethod;
}): Promise<{ verified: boolean; status: string; message: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { verified: boolean; status: string; message: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Verification check failed.');
  }
  return data;
}

export async function authorizeBackendStream(params: {
  videoUrl: string;
  isPremium: boolean;
  hasActiveSubscription: boolean;
  isOwnerOrAdmin: boolean;
}): Promise<{ allowed: boolean; signedUrl?: string; reason?: string; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/stream/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(params),
  });
  return (await res.json()) as { allowed: boolean; signedUrl?: string; reason?: string; error?: string };
}

/**
 * Resumable chunked file upload to Express backend with real progress callback.
 */
export async function uploadFileResumable(params: {
  file: File;
  kind: 'video' | 'image' | 'subtitle';
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<{ url: string; filename: string }> {
  const { file, kind, onProgress, signal } = params;
  const headers = await getAuthHeaders();
  const chunkSize = 1024 * 1024; // 1 MB chunks
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

  const initRes = await fetch('/api/uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      totalSize: file.size,
      totalChunks,
      kind,
    }),
    signal,
  });
  const initData = (await initRes.json()) as { uploadId?: string; error?: string };
  if (!initRes.ok || !initData.uploadId) {
    throw new Error(initData.error || 'Failed to initialize upload.');
  }

  const uploadId = initData.uploadId;

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunkBlob = file.slice(start, end);
    const buffer = await chunkBlob.arrayBuffer();

    const chunkRes = await fetch(`/api/uploads/chunk/${encodeURIComponent(uploadId)}`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'x-chunk-index': String(i),
      },
      body: buffer,
      signal,
    });
    if (!chunkRes.ok) {
      const errBody = (await chunkRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(errBody.error || `Failed uploading chunk ${i + 1}/${totalChunks}`);
    }
    onProgress?.(Math.round(((i + 1) / totalChunks) * 95));
  }

  const completeRes = await fetch(`/api/uploads/complete/${encodeURIComponent(uploadId)}`, {
    method: 'POST',
    headers,
    signal,
  });
  const completeData = (await completeRes.json()) as { url?: string; filename?: string; error?: string };
  if (!completeRes.ok || !completeData.url) {
    throw new Error(completeData.error || 'Failed to finalize upload.');
  }

  onProgress?.(100);
  return { url: completeData.url, filename: completeData.filename || file.name };
}
