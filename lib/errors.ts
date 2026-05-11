// ============================================================
// Custom Application Errors
// ============================================================
// Each error carries an HTTP status code so route handlers
// can catch them and return the right response without
// coupling business logic to HTTP semantics.
// ============================================================

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 409 — Stock conflict (e.g., two users reserving the last item) */
export class InsufficientStockError extends AppError {
  constructor(message = "Insufficient stock available") {
    super(message, 409, "INSUFFICIENT_STOCK");
    this.name = "InsufficientStockError";
  }
}

/** 410 — Reservation has expired */
export class ReservationExpiredError extends AppError {
  constructor(message = "Reservation has expired") {
    super(message, 410, "RESERVATION_EXPIRED");
    this.name = "ReservationExpiredError";
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** 400 — Invalid request / state transition */
export class InvalidStateError extends AppError {
  constructor(message = "Invalid reservation state") {
    super(message, 400, "INVALID_STATE");
    this.name = "InvalidStateError";
  }
}

/** 429 — Rate limited */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

/** 409 — Duplicate request (idempotency) */
export class DuplicateRequestError extends AppError {
  constructor(
    message = "Duplicate request",
    public cachedResponse: unknown = null,
    public cachedStatusCode: number = 200
  ) {
    super(message, 409, "DUPLICATE_REQUEST");
    this.name = "DuplicateRequestError";
  }
}
