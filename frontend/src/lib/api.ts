export interface HealthResponse {
  success: boolean;
  data?: {
    status: string;
    service: string;
    uptime: number;
    timestamp: string;
    database: {
      status: "connected" | "disconnected";
      message: string;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        success: false,
        error: {
          message: `Backend returned status ${res.status}`,
          code: "HTTP_ERROR",
        },
      };
    }

    const data: HealthResponse = await res.json();
    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to backend";
    return {
      success: false,
      error: {
        message,
        code: "CONNECTION_ERROR",
      },
    };
  }
}
