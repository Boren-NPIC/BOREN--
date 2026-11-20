import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  createBackendPaymentOrder,
  fetchPaymentGatewayStatus,
  verifyBackendPayment,
} from '../lib/apiClient';
import {
  createPendingPaymentRecord,
  listUserPayments,
  submitManualPaymentProof,
} from '../lib/firestoreService';
import { calculatePlanAmountKhr, formatKhr, khrToUsdReference } from '../utils/billing';
import type {
  PaymentGatewayStatus,
  PaymentMethod,
  PaymentOrderResult,
  PaymentRecord,
  PlanType,
} from '../types';

export function PaymentPage() {
  const [searchParams] = useSearchParams();
  const initialPlan: PlanType = searchParams.get('plan') === 'yearly' ? 'yearly' : 'monthly';

  const { firebaseUser, isEmailVerified, siteSettings, refreshUserData } = useApp();

  const [plan, setPlan] = useState<PlanType>(initialPlan);
  const [method, setMethod] = useState<PaymentMethod>(
    siteSettings.khqrEnabled ? 'khqr' : siteSettings.abaPayWayEnabled ? 'aba_payway' : 'manual'
  );
  const [gatewayStatus, setGatewayStatus] = useState<PaymentGatewayStatus | null>(null);
  const [activeOrder, setActiveOrder] = useState<PaymentOrderResult | null>(null);
  const [activePaymentDoc, setActivePaymentDoc] = useState<PaymentRecord | null>(null);
  const [myPayments, setMyPayments] = useState<PaymentRecord[]>([]);

  const [receiptRef, setReceiptRef] = useState('');
  const [manualNote, setManualNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    void fetchPaymentGatewayStatus()
      .then(setGatewayStatus)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !isEmailVerified) return;
    void listUserPayments(firebaseUser.uid)
      .then(setMyPayments)
      .catch(() => []);
  }, [firebaseUser, isEmailVerified]);

  const amountKhr = calculatePlanAmountKhr(plan, siteSettings);

  const handleCreateOrder = async () => {
    if (!firebaseUser) {
      setError('Please sign in first to create a payment order.');
      return;
    }
    if (!isEmailVerified) {
      setError('Please verify your email address before initiating payment.');
      return;
    }

    setBusy(true);
    setError('');
    setStatusMessage('');
    try {
      const order = await createBackendPaymentOrder({
        plan,
        method,
        amountKhr,
        exchangeRateKhrPerUsd: siteSettings.exchangeRateKhrPerUsd,
      });

      const saved = await createPendingPaymentRecord({
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email || '',
        plan,
        method,
        amountKhr: order.amountKhr,
        exchangeRateKhrPerUsd: order.exchangeRateKhrPerUsd,
        orderRef: order.orderRef,
      });

      setActiveOrder(order);
      setActivePaymentDoc(saved);
      setMyPayments((prev) => [saved, ...prev]);
      setStatusMessage(
        order.providerConfigured
          ? `Order ${order.orderRef} created. Complete payment and verify below.`
          : `Order ${order.orderRef} created in Pending Payment Verification status.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payment order.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyStatus = async () => {
    if (!activeOrder) return;
    setVerifyBusy(true);
    setError('');
    try {
      const result = await verifyBackendPayment({
        orderRef: activeOrder.orderRef,
        method: activeOrder.method,
      });
      setStatusMessage(result.message);
      await refreshUserData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleSubmitManualProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaymentDoc) return;
    if (receiptRef.trim().length < 3) {
      setError('Please enter your bank transaction or receipt reference number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitManualPaymentProof(activePaymentDoc.id, receiptRef.trim(), manualNote.trim());
      setStatusMessage(
        `Receipt reference "${receiptRef.trim()}" attached to order ${activePaymentDoc.orderRef}. An Administrator will verify your transfer and activate Premium.`
      );
      setReceiptRef('');
      setManualNote('');
      if (firebaseUser) {
        const updated = await listUserPayments(firebaseUser.uid);
        setMyPayments(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payment proof.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="border-b border-white/10 pb-6 space-y-2">
        <p className="text-xs font-medium text-cyan-300">Cambodia Secure Checkout · KHR (៛)</p>
        <h1 className="text-3xl font-bold text-white">Complete Premium Subscription</h1>
        <p className="text-sm text-zinc-400">
          Select your plan and Cambodia payment method. Premium activates strictly after official payment verification.
        </p>
      </div>

      {!firebaseUser ? (
        <div className="rounded-xl border border-white/10 bg-[#111119] p-8 text-center space-y-4">
          <h2 className="text-xl font-semibold text-white">Sign in required for checkout</h2>
          <p className="text-sm text-zinc-400">
            Create or sign in to your BORINA TV account so your verified Premium subscription links to your profile.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/login" className="px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold">
              Sign In
            </Link>
            <Link to="/register" className="px-5 py-2.5 rounded-lg bg-white/10 text-white text-sm font-medium">
              Create Account
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Step 1 & 2: Plan + Payment Method Selection */}
          <div className="lg:col-span-3 space-y-6">
            <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">1. Choose Plan</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPlan('monthly')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    plan === 'monthly'
                      ? 'bg-purple-600/20 border-purple-400 text-white'
                      : 'bg-[#090910] border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  <p className="text-sm font-semibold">Monthly Premium</p>
                  <p className="text-xl font-bold font-mono-tabular mt-1">
                    {formatKhr(siteSettings.monthlyPriceKhr)}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono-tabular">
                    30 days · {khrToUsdReference(siteSettings.monthlyPriceKhr, siteSettings.exchangeRateKhrPerUsd)}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPlan('yearly')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    plan === 'yearly'
                      ? 'bg-purple-600/20 border-purple-400 text-white'
                      : 'bg-[#090910] border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  <p className="text-sm font-semibold">Yearly Premium</p>
                  <p className="text-xl font-bold font-mono-tabular mt-1">
                    {formatKhr(siteSettings.yearlyPriceKhr)}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono-tabular">
                    365 days · {khrToUsdReference(siteSettings.yearlyPriceKhr, siteSettings.exchangeRateKhrPerUsd)}
                  </p>
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">2. Select Payment Method</h2>
              <div className="space-y-3">
                {siteSettings.khqrEnabled && (
                  <button
                    type="button"
                    onClick={() => setMethod('khqr')}
                    className={`w-full text-left p-4 rounded-xl border flex items-start justify-between gap-4 transition-colors ${
                      method === 'khqr'
                        ? 'bg-cyan-500/10 border-cyan-400 text-white'
                        : 'bg-[#090910] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <QrCode className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-white">KHQR (Bakong Cambodia)</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Pay with ABA, ACLEDA, Wing, Bakong, or any KHQR-enabled Cambodian bank app.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {gatewayStatus?.khqrConfigured ? 'Gateway Active' : 'Pending Setup'}
                    </span>
                  </button>
                )}

                {siteSettings.abaPayWayEnabled && (
                  <button
                    type="button"
                    onClick={() => setMethod('aba_payway')}
                    className={`w-full text-left p-4 rounded-xl border flex items-start justify-between gap-4 transition-colors ${
                      method === 'aba_payway'
                        ? 'bg-cyan-500/10 border-cyan-400 text-white'
                        : 'bg-[#090910] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <CreditCard className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-white">ABA PayWay</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Official ABA Bank PayWay checkout (ABA Mobile & cards) verified server-side.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {gatewayStatus?.abaPayWayConfigured ? 'Gateway Active' : 'Pending Setup'}
                    </span>
                  </button>
                )}

                {siteSettings.manualVerificationEnabled && (
                  <button
                    type="button"
                    onClick={() => setMethod('manual')}
                    className={`w-full text-left p-4 rounded-xl border flex items-start justify-between gap-4 transition-colors ${
                      method === 'manual'
                        ? 'bg-cyan-500/10 border-cyan-400 text-white'
                        : 'bg-[#090910] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-white">Manual Payment Verification</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Create a pending order and submit your bank transfer receipt for Admin approval.
                        </p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={handleCreateOrder}
                className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
              >
                {busy ? 'Creating Payment Order...' : `Create Payment Order (${formatKhr(amountKhr)})`}
              </button>
            </section>

            {/* Active Order Instructions / Setup-Required Flow */}
            {activeOrder && (
              <section className="rounded-xl border border-cyan-400/40 bg-[#111119] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-xs text-zinc-400">Order Reference</p>
                    <p className="text-lg font-bold font-mono-tabular text-cyan-300">{activeOrder.orderRef}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">Status</p>
                    <p className="text-sm font-semibold text-amber-300">Pending Payment Verification</p>
                  </div>
                </div>

                {!activeOrder.providerConfigured && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-4 flex items-start gap-3 text-xs text-amber-100 leading-relaxed">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Payment Gateway Credentials Setup Required</p>
                      <p>{activeOrder.setupRequiredReason}</p>
                      <p className="text-amber-200/80">
                        BORINA TV does not fabricate merchant QR codes or fake paid statuses. Your order stays strictly <strong>Pending</strong> until verified by the official gateway or an Administrator.
                      </p>
                    </div>
                  </div>
                )}

                <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-300">
                  {activeOrder.instructions.map((step, i) => (
                    <li key={i} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>

                {siteSettings.manualInstructions && (
                  <p className="text-xs text-zinc-400 border-t border-white/10 pt-3">
                    {siteSettings.manualInstructions}
                  </p>
                )}

                {/* Official ABA PayWay Checkout POST Form (only rendered when server credentials are genuinely configured) */}
                {activeOrder.providerConfigured && activeOrder.abaCheckoutPayload && (
                  <form
                    action={activeOrder.abaCheckoutPayload.endpoint}
                    method="POST"
                    target="_blank"
                    className="pt-2"
                  >
                    <input type="hidden" name="req_time" value={activeOrder.abaCheckoutPayload.reqTime} />
                    <input type="hidden" name="merchant_id" value={activeOrder.abaCheckoutPayload.merchantId} />
                    <input type="hidden" name="tran_id" value={activeOrder.abaCheckoutPayload.tranId} />
                    <input type="hidden" name="amount" value={activeOrder.abaCheckoutPayload.amount} />
                    <input type="hidden" name="currency" value={activeOrder.abaCheckoutPayload.currency} />
                    <input type="hidden" name="hash" value={activeOrder.abaCheckoutPayload.hash} />
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-sm font-semibold"
                    >
                      Proceed to ABA PayWay Checkout
                    </button>
                  </form>
                )}

                {/* Server Verification Check Button */}
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={handleVerifyStatus}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium text-white"
                >
                  <RefreshCw className={`w-4 h-4 ${verifyBusy ? 'animate-spin' : ''}`} />
                  {verifyBusy ? 'Checking Server...' : 'Verify Payment Status with Backend'}
                </button>

                {statusMessage && (
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-3 text-xs text-cyan-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{statusMessage}</span>
                  </div>
                )}

                {/* Manual Transfer Receipt Submission */}
                {siteSettings.manualVerificationEnabled && activePaymentDoc && (
                  <form
                    onSubmit={handleSubmitManualProof}
                    className="border-t border-white/10 pt-5 space-y-3"
                  >
                    <h3 className="text-sm font-semibold text-white">
                      Submit Manual Payment Reference (for Admin Verification)
                    </h3>
                    <div>
                      <label htmlFor="receipt-ref" className="block text-xs text-zinc-400 mb-1">
                        Bank Transaction / Receipt ID
                      </label>
                      <input
                        id="receipt-ref"
                        type="text"
                        required
                        maxLength={200}
                        value={receiptRef}
                        onChange={(e) => setReceiptRef(e.target.value)}
                        placeholder="e.g. ABA-TXN-20261119-8841"
                        className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-note" className="block text-xs text-zinc-400 mb-1">
                        Payer Name / Transfer Note (optional)
                      </label>
                      <input
                        id="manual-note"
                        type="text"
                        maxLength={500}
                        value={manualNote}
                        onChange={(e) => setManualNote(e.target.value)}
                        placeholder="Sender name or bank branch"
                        className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs sm:text-sm font-semibold text-white"
                    >
                      Submit Receipt for Verification
                    </button>
                  </form>
                )}
              </section>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <aside className="lg:col-span-2 space-y-5">
            <div className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">Order Summary</h2>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Plan</dt>
                  <dd className="text-white font-medium capitalize">{plan} Premium</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Payment Method</dt>
                  <dd className="text-white uppercase text-xs font-medium">{method.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Exchange Rate</dt>
                  <dd className="font-mono-tabular text-zinc-300">
                    1 USD = {siteSettings.exchangeRateKhrPerUsd.toLocaleString()} KHR
                  </dd>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between items-baseline">
                  <dt className="text-zinc-200 font-semibold">Total Due</dt>
                  <dd className="text-right">
                    <span className="block text-2xl font-bold font-mono-tabular text-cyan-300">
                      {formatKhr(amountKhr)}
                    </span>
                    <span className="text-xs font-mono-tabular text-zinc-400">
                      {khrToUsdReference(amountKhr, siteSettings.exchangeRateKhrPerUsd)}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {myPayments.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-[#111119] p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Recent Payment Orders</h3>
                <div className="space-y-2.5">
                  {myPayments.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-xs border-b border-white/5 pb-2 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="font-mono-tabular text-zinc-200 truncate">{p.orderRef}</p>
                        <p className="text-zinc-500 capitalize">
                          {p.plan} · {p.method.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono-tabular text-white">{formatKhr(p.amountKhr)}</p>
                        <p
                          className={
                            p.status === 'paid'
                              ? 'text-emerald-400 capitalize'
                              : p.status === 'pending'
                              ? 'text-amber-300 capitalize'
                              : 'text-rose-400 capitalize'
                          }
                        >
                          {p.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
