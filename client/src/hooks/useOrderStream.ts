import { useEffect, useRef } from "react";

type OrderStreamEvent =
  | {
      type: "order-created";
      orderId: number;
      vendorId: number;
    }
  | {
      type: "order-status-changed";
      orderId: number;
      vendorId: number;
      status: string;
    }
  | {
      type: "order-updated";
      orderId: number;
      vendorId: number;
      tableId?: number | null;
    }
  | {
      type: "kot-created";
      orderId: number;
      vendorId: number;
      kotId: number;
      ticketNumber: string;
    }
  | {
      type: "table-status-changed";
      tableId: number;
      vendorId: number;
      isActive: boolean;
    }
  | {
      type: "connected";
    };

type UseOrderStreamOptions = {
  enabled?: boolean;
  onEvent?: (event: OrderStreamEvent) => void;
};

export function useOrderStream(options: UseOrderStreamOptions = {}) {
  const { enabled = true, onEvent } = options;
  const handlerRef = useRef<typeof onEvent>(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource("/api/orders/stream");

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as OrderStreamEvent;
        handlerRef.current?.(parsed);
      } catch (error) {
        console.error("Failed to parse order stream event", error);
      }
    };

    source.onerror = (error) => {
      console.error("Order stream encountered an error", error);
      // EventSource automatically retries. We log for diagnostics.
    };

    return () => {
      source.close();
    };
  }, [enabled]);
}


