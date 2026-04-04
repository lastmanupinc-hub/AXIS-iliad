import { useState, useCallback } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import type { SnapshotResponse } from "./api.ts";

export function App() {
  const [result, setResult] = useState<SnapshotResponse | null>(null);

  const handleUploadComplete = useCallback((data: SnapshotResponse) => {
    setResult(data);
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
  }, []);

  return (
    <>
      <header className="header">
        <div className="flex" style={{ gap: 12 }}>
          <h1 style={{ margin: 0, cursor: "pointer" }} onClick={handleReset}>
            ⚡ Axis Toolbox
          </h1>
          <span className="badge badge-accent">v0.2.0</span>
        </div>
        {result && (
          <button className="btn" onClick={handleReset}>
            ← New Snapshot
          </button>
        )}
      </header>
      {result ? (
        <DashboardPage result={result} />
      ) : (
        <UploadPage onComplete={handleUploadComplete} />
      )}
    </>
  );
}
