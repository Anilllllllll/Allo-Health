"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useConfirmReservation,
  useReleaseReservation,
  type Reservation,
} from "@/hooks/use-reservations";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ============================================================
// Reservation Panel — Countdown timer + Confirm/Cancel
// ============================================================

interface ReservationPanelProps {
  reservation: Reservation;
  onClose: () => void;
}

export function ReservationPanel({
  reservation,
  onClose,
}: ReservationPanelProps) {
  const confirmMutation = useConfirmReservation();
  const releaseMutation = useReleaseReservation();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [status, setStatus] = useState(reservation.status);

  // Calculate remaining time
  const calculateTimeLeft = useCallback(() => {
    const expiresAt = new Date(reservation.expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((expiresAt - now) / 1000));
  }, [reservation.expiresAt]);

  // Countdown timer
  useEffect(() => {
    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setStatus("EXPIRED");
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateTimeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleConfirm = async () => {
    try {
      await confirmMutation.mutateAsync(reservation.id);
      setStatus("CONFIRMED");
      toast.success("Purchase confirmed!", {
        description: "Your order has been placed successfully.",
      });
    } catch (err) {
      const error = err as Error & { status?: number };
      if (error.status === 410) {
        setStatus("EXPIRED");
        toast.error("Reservation expired", {
          description: "The reservation time ran out. Please try again.",
        });
      } else {
        toast.error("Confirmation failed", {
          description: error.message,
        });
      }
    }
  };

  const handleRelease = async () => {
    try {
      await releaseMutation.mutateAsync(reservation.id);
      setStatus("RELEASED");
      toast.info("Reservation cancelled", {
        description: "Stock has been released.",
      });
    } catch (err) {
      const error = err as Error;
      toast.error("Release failed", {
        description: error.message,
      });
    }
  };

  const isDone = status !== "PENDING";

  // Status badge colors
  const statusVariant = {
    PENDING: "default" as const,
    CONFIRMED: "default" as const,
    RELEASED: "secondary" as const,
    EXPIRED: "destructive" as const,
  };

  // Progress bar percentage
  const ttlSeconds =
    (parseInt(process.env.NEXT_PUBLIC_RESERVATION_TTL_MINUTES || "10") || 10) *
    60;
  const progressPercent = Math.max(0, (timeLeft / ttlSeconds) * 100);

  return (
    <Card
      className={`mb-6 border-2 transition-colors ${
        status === "PENDING"
          ? "border-primary/50 shadow-lg shadow-primary/10"
          : status === "CONFIRMED"
            ? "border-green-500/50"
            : status === "EXPIRED"
              ? "border-destructive/50"
              : "border-muted"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Active Reservation</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[status]}>{status}</Badge>
            {status === "PENDING" && (
              <Badge
                variant={timeLeft < 60 ? "destructive" : "secondary"}
                className="font-mono tabular-nums text-base px-3 py-1"
              >
                ⏱ {formatTime(timeLeft)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Countdown progress bar */}
      {status === "PENDING" && (
        <div className="px-6 pb-2">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                timeLeft < 60 ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Reservation ID</p>
            <p className="font-mono text-xs mt-0.5">{reservation.id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Quantity</p>
            <p className="font-medium">{reservation.quantity} unit(s)</p>
          </div>
        </div>

        {!isDone && (
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleConfirm}
              disabled={
                confirmMutation.isPending || releaseMutation.isPending
              }
              className="flex-1"
            >
              {confirmMutation.isPending ? "Confirming..." : "✓ Confirm Purchase"}
            </Button>
            <Button
              variant="outline"
              onClick={handleRelease}
              disabled={
                confirmMutation.isPending || releaseMutation.isPending
              }
              className="flex-1"
            >
              {releaseMutation.isPending ? "Cancelling..." : "✕ Cancel"}
            </Button>
          </div>
        )}

        {isDone && (
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
