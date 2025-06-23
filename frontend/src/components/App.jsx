import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { record } from "rrweb";

import { useAuth } from "../contexts/AuthContext";
import AdminDashboard from "../pages/AdminDashboard";
import AnomalyBar from "./AnomalyBar";
import AnomalyLineChart from "./AnomalyLineChart";
import AnomalyPie from "./AnomalyPie";
import BehaviorProfile from "./BehaviorProfile";
import DataTable from "./DataTable";
import HeatmapViewer from "./HeatmapViewer";
import Home from "./Home";
import LiveBarChart from "./LiveBarChart";
import Login from "./Login";
import Navbar from "./Navbar";
import PathFlowChart from "./PathFlowChart";
import ProtectedRoute from "./ProtectedRoute";
import ResultsHistory from "./ResultsHistory";
import SessionReplay from "./SessionReplay";
import StatsCard from "./StatsCard";
import Unauthorized from "./Unauthorized";
import Upload from "./Upload";


const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const WS_BASE = import.meta.env.VITE_WS_BASE ?? "ws://localhost:8000";
const WS_PATH = "/ws/stream";

export default function App() {
  const { user, role, loading: authLoading, login } = useAuth();
  const location = useLocation();

  const [summary, setSummary] = useState(null);
  const [fullBatch, setFullBatch] = useState([]);
  const [batchRows, setBatchRows] = useState([]);
  const [liveRows, setLiveRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fileId, setFileId] = useState(null);

  useEffect(() => {
    const allowedPaths = ["/", "/heatmap", "/history"];
    if (!allowedPaths.includes(location.pathname) || !user) return;

    const handleClick = (e) => {
      fetch(`${API_BASE}/clicks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: e.clientX,
          y: e.clientY,
          pathname: location.pathname,
          timestamp: Date.now(),
        }),
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [location.pathname, user]);

  // rrweb session recorder with full snapshot + interval
  useEffect(() => {
  const events = [];

  const stop = record({
    emit: (event) => events.push(event),
    recordCanvas: true,
  });

  // ✅ Force an initial full snapshot
  if (typeof record.takeFullSnapshot === "function") {
    record.takeFullSnapshot();
  }

  const flush = () => {
    if (events.length === 0) return;

    // ⚠️ Only send if we have at least one full snapshot (type:2)
    if (!events.some((e) => e.type === 2)) {
      console.warn("No full snapshot – session not sent");
      return;
    }

    navigator.sendBeacon(
      `${API_BASE}/session`,
      new Blob([JSON.stringify({ events })], { type: "application/json" })
    );
    events.length = 0;          // ✅ clear after sending
  };

  const timer = setInterval(flush, 10000);
  window.addEventListener("beforeunload", flush);

  return () => {
    stop();
    flush();
    clearInterval(timer);
    window.removeEventListener("beforeunload", flush);
  };
}, []);


  useEffect(() => {
    fetch(`${API_BASE}/path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: location.pathname,
        timestamp: Date.now(),
      }),
    });
  }, [location]);

  const authHeader = async () => {
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const onUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await axios.post(`${API_BASE}/analyze`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(await authHeader()),
        },
        maxBodyLength: Infinity,
      });
      setSummary(data.summary);
      setFullBatch(data.rows);
      setFileId(data.file_id);
      setBatchRows([]);
    } catch (err) {
      console.error(err);
      alert("Upload failed — check backend, CORS, or auth.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE}/download/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "anomalies.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed. Check auth or backend.");
    }
  };

  useEffect(() => {
    if (!fullBatch.length) return;
    let idx = 0;
    const CHUNK = 50;
    const id = setInterval(() => {
      setBatchRows((prev) => [...prev, ...fullBatch.slice(idx, idx + CHUNK)]);
      idx += CHUNK;
      if (idx >= fullBatch.length) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [fullBatch]);

  const wsRef = useRef(null);
  useEffect(() => {
    if (authLoading) return;

    let retryTimer;
    let debTimer;

    const connect = async () => {
      const token = user ? await user.getIdToken() : "";
      const ws = new WebSocket(`${WS_BASE}${WS_PATH}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => console.log("✅ WebSocket connected");
      ws.onerror = (e) => console.error("WebSocket error", e);
      ws.onmessage = (evt) => {
        const row = JSON.parse(evt.data);
        clearTimeout(debTimer);
        debTimer = setTimeout(() => {
          setLiveRows((prev) => [row, ...prev].slice(0, 100));
        }, 50);
      };
      ws.onclose = () => {
        console.warn("🔌 WebSocket closed — retrying in 5s");
        retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [authLoading, user]);

  if (authLoading) {
    return <p className="p-6 text-cybergreen">Loading authentication…</p>;
  }

  const lineChartData = batchRows.map((row, idx) => ({
    index: idx,
    anomaly: Number(row.Anomaly ?? row.anomaly ?? 0),
  }));

  return (
    <div className="min-h-screen bg-black text-cybergreen">
      <Navbar />
      {!user ? (
        <div className="p-6 text-center">
          <h1 className="text-3xl font-bold mb-4">User Pattern Analyzer</h1>
          <p className="mb-4">Please log in to view the dashboard.</p>
          <button
            onClick={login}
            className="px-4 py-2 bg-cybergreen text-black rounded hover:bg-green-700"
          >
            Login
          </button>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <h1 className="text-3xl font-bold">User Pattern Analyzer</h1>

          {role !== "viewer" && (
            <>
              <label className="inline-block px-4 py-2 bg-cybergreen text-black rounded cursor-pointer">
                Upload Log
                <input type="file" onChange={onUpload} className="hidden" />
              </label>
              {busy && <p>Uploading…</p>}
            </>
          )}

          {summary && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <StatsCard title="Total" value={summary.total} />
                <StatsCard title="Anomalies" value={summary.anomalies} />
                <StatsCard title="Normal" value={summary.normal} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <AnomalyPie summary={summary} />
                <AnomalyBar summary={summary} />
              </div>
              <AnomalyLineChart data={lineChartData} />
              <DataTable rows={batchRows} title="Batch Results (streamed)" height={400} />

              {fileId && (
                <button
                  onClick={handleDownload}
                  className="underline text-cybergreen"
                >
                  Download Anomalies CSV
                </button>
              )}
            </>
          )}

          <h2 className="text-2xl font-bold">Real‑Time Stream</h2>
          <DataTable rows={liveRows} title="Live Logs (last 100)" height={300} />
          <LiveBarChart dataStream={liveRows} />
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/history" element={<ResultsHistory />} />
        <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/heatmap" element={<HeatmapViewer />} />
        <Route path="/replay" element={<SessionReplay />} />
        <Route path="/session" element={<SessionReplay />} />
        <Route path="/flow" element={<PathFlowChart />} />
        <Route path="/profile" element={<BehaviorProfile />} />

      </Routes>
    </div>
  );
}
