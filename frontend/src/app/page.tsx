"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchHealth, type HealthResponse } from "../lib/api";

export default function DashboardPage() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    const result = await fetchHealth();
    setHealthData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const isServerHealthy = healthData?.success && healthData.data?.status === "healthy";
  const dbStatus = healthData?.data?.database?.status;
  const isDbConnected = dbStatus === "connected";

  return (
    <main className="container">
      <header className="header">
        <h1>Personal AI Workflow Orchestrator</h1>
        <p>Local Personal AI Automation &bull; Phase 1 Foundation</p>
      </header>

      <section className="grid">
        {/* Backend Status Card */}
        <div className="card">
          <h2>Backend Service</h2>
          <div>
            Status:{" "}
            {loading ? (
              <span className="status-badge badge-pending">Checking...</span>
            ) : isServerHealthy ? (
              <span className="status-badge badge-connected">Healthy</span>
            ) : (
              <span className="status-badge badge-disconnected">Unreachable</span>
            )}
          </div>
          <div className="details">
            {healthData?.data ? (
              <>
                <p>Service: {healthData.data.service}</p>
                <p>Uptime: {Math.floor(healthData.data.uptime)}s</p>
                <p>Checked: {new Date(healthData.data.timestamp).toLocaleTimeString()}</p>
              </>
            ) : (
              <p>
                {healthData?.error?.message ||
                  "Ensure backend is running on http://localhost:5001"}
              </p>
            )}
          </div>
        </div>

        {/* Database Status Card */}
        <div className="card">
          <h2>MySQL Database</h2>
          <div>
            Status:{" "}
            {loading ? (
              <span className="status-badge badge-pending">Checking...</span>
            ) : !isServerHealthy ? (
              <span className="status-badge badge-unknown">Unavailable</span>
            ) : isDbConnected ? (
              <span className="status-badge badge-connected">Connected</span>
            ) : (
              <span className="status-badge badge-disconnected">Disconnected</span>
            )}
          </div>
          <div className="details">
            <p>
              {loading
                ? "Database status retrieved via backend health probe."
                : !isServerHealthy
                ? "Database status unavailable because backend is unreachable."
                : healthData?.data?.database?.message ||
                  "Database status retrieved via backend health probe."}
            </p>
          </div>
        </div>

        {/* Phase Roadmap Card */}
        <div className="card">
          <h2>Phase 1 Status</h2>
          <div className="details">
            <p>&bull; Clean project boundaries (frontend/backend/docs)</p>
            <p>&bull; Express REST API with health check</p>
            <p>&bull; Resilient MySQL connection pooling strategy</p>
            <p>&bull; Next.js 15 + React 19 bootstrap</p>
          </div>
        </div>
      </section>

      <div className="actions">
        <button
          onClick={checkConnection}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Checking..." : "Recheck Connection"}
        </button>
      </div>

      <aside className="footer-note">
        <strong>Phase 2 Preview:</strong> The visual workflow canvas (React Flow), node
        graph traversal, execution engine, and AI provider integrations will be implemented
        in subsequent phases according to <code>docs/PROJECT_PLAN.md</code>.
      </aside>
    </main>
  );
}
