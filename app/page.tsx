import { ProductGrid } from "@/components/product-grid";

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-primary">Allo</span> Inventory
            </h1>
            <p className="text-sm text-muted-foreground">
              Concurrency-safe reservation system
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            PostgreSQL Row Locking Active
          </div>
        </div>
      </header>

      {/* Product Grid */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Products</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reserve items across warehouses. Only one user can reserve the last
            item — powered by{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              SELECT ... FOR UPDATE
            </code>
          </p>
        </div>

        <ProductGrid />
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
