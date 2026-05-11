"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  useReservations,
  useConfirmReservation,
  useReleaseReservation,
  type ReservationWithDetails,
} from "@/hooks/use-reservations";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ============================================================
// Reservations Page — Full reservation management
// ============================================================

export default function ReservationsPage() {
  const { data: reservations, isLoading } = useReservations();
  const confirmMutation = useConfirmReservation();
  const releaseMutation = useReleaseReservation();

  const handleConfirm = async (id: string) => {
    try {
      await confirmMutation.mutateAsync(id);
      toast.success("Purchase confirmed!");
    } catch (err) {
      const error = err as Error & { status?: number };
      if (error.status === 410) {
        toast.error("Reservation expired", {
          description: "The reservation time ran out.",
        });
      } else {
        toast.error("Confirmation failed", { description: error.message });
      }
    }
  };

  const handleRelease = async (id: string) => {
    try {
      await releaseMutation.mutateAsync(id);
      toast.info("Reservation cancelled");
    } catch (err) {
      toast.error("Release failed", {
        description: (err as Error).message,
      });
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    CONFIRMED: "bg-green-500/10 text-green-500 border-green-500/20",
    RELEASED: "bg-muted text-muted-foreground border-muted",
    EXPIRED: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <main className="flex-1">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <Link href="/" className="hover:text-primary transition-colors">
                <span className="text-primary">Allo</span> Inventory
              </Link>
            </h1>
            <p className="text-sm text-muted-foreground">
              Reservation Management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="outline" size="sm">
                ← Products
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Auto-refreshing
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">All Reservations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-refreshes every 5 seconds. Manage pending reservations below.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="py-6">
                  <div className="h-5 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-1/4 mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reservations?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No reservations yet.{" "}
                <Link href="/" className="text-primary hover:underline">
                  Reserve a product
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reservations?.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                onConfirm={handleConfirm}
                onRelease={handleRelease}
                isConfirming={confirmMutation.isPending}
                isReleasing={releaseMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          Allo Health Engineering Assignment — Inventory Reservation System
        </div>
      </footer>
    </main>
  );
}

// ============================================================
// Reservation Card with live countdown
// ============================================================

function ReservationCard({
  reservation,
  onConfirm,
  onRelease,
  isConfirming,
  isReleasing,
}: {
  reservation: ReservationWithDetails;
  onConfirm: (id: string) => void;
  onRelease: (id: string) => void;
  isConfirming: boolean;
  isReleasing: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState(0);

  const calculateTimeLeft = useCallback(() => {
    const expiresAt = new Date(reservation.expiresAt).getTime();
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  }, [reservation.expiresAt]);

  useEffect(() => {
    if (reservation.status !== "PENDING") return;

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateTimeLeft, reservation.status]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const isPending = reservation.status === "PENDING";
  const isExpiredLocally = isPending && timeLeft <= 0;

  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    CONFIRMED: "bg-green-500/10 text-green-500 border-green-500/20",
    RELEASED: "bg-muted text-muted-foreground border-muted",
    EXPIRED: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Card
      className={`transition-all ${
        isPending && !isExpiredLocally
          ? "border-primary/30 shadow-sm"
          : ""
      }`}
    >
      <CardContent className="py-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Product info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">
                {reservation.product.name}
              </h3>
              <Badge
                variant="outline"
                className={statusColors[reservation.status]}
              >
                {isExpiredLocally ? "EXPIRED" : reservation.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {reservation.warehouse.name} •{" "}
              {reservation.quantity} unit(s) •{" "}
              ${reservation.product.price.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              ID: {reservation.id}
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isPending && !isExpiredLocally && (
              <>
                <Badge
                  variant={timeLeft < 60 ? "destructive" : "secondary"}
                  className="font-mono tabular-nums px-2.5 py-1"
                >
                  ⏱ {formatTime(timeLeft)}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => onConfirm(reservation.id)}
                  disabled={isConfirming || isReleasing}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRelease(reservation.id)}
                  disabled={isConfirming || isReleasing}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
