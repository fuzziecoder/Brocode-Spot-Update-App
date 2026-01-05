import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { UserRole, Spot, Payment, PaymentStatus } from "../types";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import { QRCodeCanvas } from "qrcode.react";
import { spotService, paymentService, invitationService } from "../services/database";
import { InvitationStatus } from "../types";
import { supabase } from "../services/supabase";

/* -------------------------------------------------------------------------- */
/* Status Badge */
/* -------------------------------------------------------------------------- */

const PaymentStatusBadge: React.FC<{ paid: boolean }> = ({ paid }) => (
  <span
    className={`px-2 py-1 text-xs font-semibold rounded-full border ${
      paid
        ? "bg-green-500/20 text-green-300 border-green-500"
        : "bg-red-500/20 text-red-300 border-red-500"
    }`}
  >
    {paid ? "Paid" : "Not Paid"}
  </span>
);

/* -------------------------------------------------------------------------- */
/* Page */
/* -------------------------------------------------------------------------- */

const PaymentPage: React.FC = () => {
  const { profile } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const spotData = await spotService.getUpcomingSpot();
      setSpot(spotData);

      if (spotData) {
        // Get all confirmed invitations
        const invitations = await invitationService.getInvitations(spotData.id);
        const confirmedInvitations = invitations.filter(
          (inv) => inv.status === InvitationStatus.CONFIRMED
        );

        // Get existing payments
        const existingPayments = await paymentService.getPayments(spotData.id);
        const existingPaymentUserIds = new Set(
          existingPayments.map((p) => p.user_id)
        );

        // Create payment entries for confirmed users who don't have one yet
        const paymentPromises = confirmedInvitations
          .filter((inv) => !existingPaymentUserIds.has(inv.user_id))
          .map((inv) =>
            paymentService.upsertPayment({
              spot_id: spotData.id,
              user_id: inv.user_id,
              status: PaymentStatus.NOT_PAID,
            }).catch((err) => {
              console.error(`Failed to create payment for user ${inv.user_id}:`, err);
              return null;
            })
          );

        await Promise.all(paymentPromises);

        // Fetch updated payments list
        const paymentData = await paymentService.getPayments(spotData.id);
        setPayments(paymentData);
      } else {
        setPayments([]);
      }
    } catch (error) {
      console.error("Error loading payment data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Set up real-time subscription for payments
    if (spot) {
      const channel = paymentService.subscribeToPayments(spot.id, (payload) => {
        fetchData();
      });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchData, spot?.id]);

  if (loading) {
    return <div className="p-8 text-center">Loading payments...</div>;
  }

  if (!spot) {
    return (
      <Card>
        <p className="text-center text-gray-400">
          No upcoming spot available.
        </p>
      </Card>
    );
  }

  const isAdmin = profile?.role === UserRole.ADMIN;
  const amount = spot.budget;
  const payeeVPA = "godw1921-1@okicici";
  const payeeName = "BroCode Admin";

  const baseUpi = `upi://pay?pa=${payeeVPA}&pn=${encodeURIComponent(
    payeeName
  )}&am=${amount}&cu=INR&tn=BroCode%20Spot%20Payment`;

  const openUPI = (app: "gpay" | "phonepe" | "paytm" | "navi") => {
    let url = baseUpi;
    if (app === "gpay") url = `tez://upi/pay?${baseUpi.split("?")[1]}`;
    if (app === "phonepe") url = `phonepe://pay?${baseUpi.split("?")[1]}`;
    if (app === "paytm") url = `paytmmp://pay?${baseUpi.split("?")[1]}`;
    if (app === "navi") url = `navi://pay?${baseUpi.split("?")[1]}`;
    window.location.href = url;
  };

  const handleMarkPaid = async (paymentId: string) => {
    if (!isAdmin) return;
    try {
      await paymentService.updatePaymentStatus(paymentId, PaymentStatus.PAID);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to update payment: ${error.message || 'Please try again.'}`);
    }
  };

  const handleMarkUnpaid = async (paymentId: string) => {
    if (!isAdmin) return;
    try {
      await paymentService.updatePaymentStatus(paymentId, PaymentStatus.NOT_PAID);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to update payment: ${error.message || 'Please try again.'}`);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 max-w-6xl mx-auto px-4">
      <h1 className="text-2xl md:text-3xl font-bold">Payment</h1>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        {/* ---------------- SCAN TO PAY ---------------- */}
        <Card className="flex flex-col items-center text-center p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Scan to Pay</h2>

          <div className="bg-white p-3 md:p-4 rounded-xl w-full max-w-[280px] flex items-center justify-center min-h-[250px]">
            <img 
              src="/images/qr.jpg" 
              alt="Payment QR Code" 
              className="w-full h-auto max-w-[250px]"
              onError={(e) => {
                // If image doesn't exist, show a placeholder with UPI ID
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const container = target.parentElement;
                if (container && !container.querySelector('.qr-placeholder')) {
                  const placeholder = document.createElement('div');
                  placeholder.className = 'qr-placeholder w-full p-4 text-center';
                  placeholder.innerHTML = `
                    <div class="text-gray-600 text-sm mb-2">QR Code Image</div>
                    <div class="text-gray-400 text-xs break-all">${payeeVPA}</div>
                    <div class="text-gray-500 text-xs mt-2">Add qr.jpg to /public/images/</div>
                  `;
                  container.appendChild(placeholder);
                }
              }}
            />
          </div>

          <p className="mt-3 text-sm md:text-base text-gray-400 font-semibold">
            Amount: ₹{amount}
          </p>
          <p className="mt-1 text-xs text-gray-500 break-all px-4">
            UPI ID: {payeeVPA}
          </p>

          {/* UPI APP BUTTONS */}
          <div className="grid grid-cols-2 gap-2 md:gap-3 mt-5 w-full">
            <button
              onClick={() => openUPI("gpay")}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg py-2 px-3 transition-colors"
            >
              <img src="/images/upi/gpay.png" alt="Google Pay" className="w-6 h-6 object-contain" />
              <span className="text-xs md:text-sm">Google Pay</span>
            </button>
            <button
              onClick={() => openUPI("phonepe")}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg py-2 px-3 transition-colors"
            >
              <img src="/images/upi/phonepe.png" alt="PhonePe" className="w-6 h-6 object-contain" />
              <span className="text-xs md:text-sm">PhonePe</span>
            </button>
            <button
              onClick={() => openUPI("paytm")}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg py-2 px-3 transition-colors"
            >
              <img src="/images/upi/paytm.png" alt="Paytm" className="w-6 h-6 object-contain" />
              <span className="text-xs md:text-sm">Paytm</span>
            </button>
            <button
              onClick={() => openUPI("navi")}
              className="flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg py-2 px-3 transition-colors"
            >
              <img src="/images/upi/navi.png" alt="Navi" className="w-6 h-6 object-contain" />
              <span className="text-xs md:text-sm">Navi</span>
            </button>
          </div>
        </Card>

        {/* ---------------- PAYMENT BREAKDOWN ---------------- */}
        <Card className="p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">
            Payment Breakdown
          </h2>

          {payments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No payments found.
            </p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => {
                const isPaid = payment.status === PaymentStatus.PAID;
                const member = payment.profiles;

                return (
                  <div
                    key={payment.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-zinc-800/50 rounded-lg border border-white/5"
                  >
                    <div 
                      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => window.location.href = `/dashboard/profile/${payment.user_id}`}
                    >
                      <img
                        src={
                          member.profile_pic_url ||
                          "https://api.dicebear.com/7.x/thumbs/svg?seed=user"
                        }
                        alt={member.name}
                        className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="font-medium text-sm md:text-base block truncate">
                          {member.name}
                        </span>
                        <span className="text-xs text-zinc-500 truncate block">
                          @{member.username}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      <PaymentStatusBadge paid={isPaid} />

                      {isAdmin && (
                        <>
                          {!isPaid ? (
                            <Button
                              size="sm"
                              onClick={() => handleMarkPaid(payment.id)}
                              className="text-xs whitespace-nowrap"
                            >
                              Mark Paid
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleMarkUnpaid(payment.id)}
                              className="text-xs whitespace-nowrap"
                            >
                              Undo
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PaymentPage;
