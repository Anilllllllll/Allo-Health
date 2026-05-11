import { z } from "zod";

// ============================================================
// Request Validation Schemas
// ============================================================

/** POST /api/reservations — Create a new reservation */
export const createReservationSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be positive"),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/** POST /api/reservations/:id/confirm */
export const confirmReservationSchema = z.object({
  id: z.string().uuid("Invalid reservation ID"),
});

/** POST /api/reservations/:id/release */
export const releaseReservationSchema = z.object({
  id: z.string().uuid("Invalid reservation ID"),
});
