"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateReservationInput } from "@/schemas/reservation";

// ============================================================
// API Types
// ============================================================

export interface StockWithWarehouse {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  available: number;
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface ProductWithStocks {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  imageUrl: string | null;
  stocks: StockWithWarehouse[];
}

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

// ============================================================
// Fetch helpers
// ============================================================

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || "Request failed") as Error & {
      status: number;
      code?: string;
    };
    error.status = res.status;
    error.code = data.code;
    throw error;
  }

  return data as T;
}

// ============================================================
// Hooks
// ============================================================

/** Fetch all products with stock levels */
export function useProducts() {
  return useQuery<ProductWithStocks[]>({
    queryKey: ["products"],
    queryFn: () => fetchJSON("/api/products"),
  });
}

/** Create a reservation */
export function useCreateReservation() {
  const queryClient = useQueryClient();

  return useMutation<Reservation, Error & { status?: number; code?: string }, CreateReservationInput>({
    mutationFn: (input) =>
      fetchJSON("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Confirm a reservation */
export function useConfirmReservation() {
  const queryClient = useQueryClient();

  return useMutation<Reservation, Error & { status?: number; code?: string }, string>({
    mutationFn: (id) =>
      fetchJSON(`/api/reservations/${id}/confirm`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Release a reservation */
export function useReleaseReservation() {
  const queryClient = useQueryClient();

  return useMutation<Reservation, Error & { status?: number; code?: string }, string>({
    mutationFn: (id) =>
      fetchJSON(`/api/reservations/${id}/release`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
