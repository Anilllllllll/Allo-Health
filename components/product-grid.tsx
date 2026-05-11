"use client";

import { useState } from "react";
import {
  useProducts,
  useCreateReservation,
  useConfirmReservation,
  useReleaseReservation,
  type Reservation,
} from "@/hooks/use-reservations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ReservationPanel } from "./reservation-panel";

// ============================================================
// Product Grid — Main product listing with stock & reserve
// ============================================================

export function ProductGrid() {
  const { data: products, isLoading, error } = useProducts();
  const createReservation = useCreateReservation();
  const [activeReservation, setActiveReservation] =
    useState<Reservation | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-40 bg-muted rounded-md" />
              <div className="h-5 bg-muted rounded w-3/4 mt-4" />
              <div className="h-4 bg-muted rounded w-1/2 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">
            Failed to load products. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleReserve = async (
    productId: string,
    warehouseId: string,
    productName: string
  ) => {
    try {
      const reservation = await createReservation.mutateAsync({
        productId,
        warehouseId,
        quantity: 1,
      });
      setActiveReservation(reservation);
      toast.success(`Reserved "${productName}"`, {
        description: `Expires in ${process.env.NEXT_PUBLIC_RESERVATION_TTL_MINUTES || 10} minutes`,
      });
    } catch (err) {
      const error = err as Error & { status?: number; code?: string };
      if (error.status === 409) {
        toast.error("Stock unavailable", {
          description: error.message || "Another user reserved the last item.",
        });
      } else if (error.status === 429) {
        toast.error("Rate limited", {
          description: "Too many requests. Please wait a moment.",
        });
      } else {
        toast.error("Reservation failed", {
          description: error.message,
        });
      }
    }
  };

  return (
    <>
      {activeReservation && (
        <ReservationPanel
          reservation={activeReservation}
          onClose={() => setActiveReservation(null)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products?.map((product) => (
          <Card
            key={product.id}
            className="overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
          >
            {/* Product Image */}
            <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-4xl opacity-20">📦</div>
              )}
              <Badge className="absolute top-3 right-3" variant="secondary">
                {product.sku}
              </Badge>
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <CardDescription>{product.description}</CardDescription>
              <p className="text-2xl font-bold text-primary mt-1">
                ${product.price.toFixed(2)}
              </p>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Warehouse Stock
              </p>

              {product.stocks.map((stock) => (
                <div
                  key={stock.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {stock.warehouse.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stock.available} of {stock.totalUnits} available
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={stock.available > 0 ? "default" : "outline"}
                    disabled={
                      stock.available <= 0 || createReservation.isPending
                    }
                    onClick={() =>
                      handleReserve(
                        product.id,
                        stock.warehouseId,
                        product.name
                      )
                    }
                    className="shrink-0"
                  >
                    {stock.available > 0 ? "Reserve" : "Out of Stock"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
