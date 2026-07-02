import { useState, useCallback, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Upload, Database, FlaskConical, LayoutDashboard, Plus,
  ChevronRight, ChevronLeft, Check, Play, Trash2, FileText,
  Cpu, Scale, BarChart2, TrendingUp, AlertCircle, X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Dataset = {
  id: string;
  name: string;
  rows: number;
  uploadedAt: string;
  file: string;
};

type Experiment = {
  id: string;
  name: string;
  dataset: string;
  promptTemplate: string;
  judges: string[];
  evalModel: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  score: number;
};

type View = "datasets" | "experiments" | "dashboard" | "new-experiment";

// Frontend model lists (static UI choices)
const JUDGE_MODELS = [
  { id: "gpt-5", label: "GPT-5", provider: "OpenAI" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro", provider: "Google" },
];

const EVAL_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
];


// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded p-3 shadow-xl text-xs font-mono">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.dataKey}: {p.value}</p>
      ))}
    </div>
  );
};

// ─── New Experiment Wizard ────────────────────────────────────────────────────

function NewExperimentWizard({
  datasets,
  onSubmit,
  onCancel,
}: {
  datasets: Dataset[];
  onSubmit: (exp: Omit<Experiment, "id" | "status" | "createdAt" | "score">) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    dataset: "",
    datasetId: "",
    promptTemplate: "",
    judges: [] as string[],
    evalModel: "",
  });

  const steps = ["Name & Dataset", "Prompt Template", "Judge Models", "Eval Model", "Review"];

  const toggleJudge = (id: string) => {
    setForm(f => ({
      ...f,
      judges: f.judges.includes(id) ? f.judges.filter(j => j !== id) : [...f.judges, id],
    }));
  };

  const canNext = () => {
    if (step === 0) return form.name.trim() && form.dataset;
    if (step === 1) return form.promptTemplate.trim().length > 10;
    if (step === 2) return form.judges.length > 0;
    if (step === 3) return form.evalModel;
    return true;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Step bar */}
      <div className="flex items-center gap-0 mb-10 px-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold border transition-all ${
                  i < step
                    ? "bg-primary border-primary text-primary-foreground"
                    : i === step
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted-foreground bg-muted/30"
                }`}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-[10px] font-mono uppercase tracking-widest whitespace-nowrap ${i === step ? "text-accent" : "text-muted-foreground"}`}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-12 mx-2 mb-5 ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {step === 0 && (
          <div className="space-y-5 max-w-lg">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Experiment Name</label>
              <input
                className="w-full bg-input-background border border-border rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition"
                placeholder="e.g. GPT-4o Accuracy Sweep v2"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Select Dataset</label>
              <div className="space-y-2">
                {datasets.map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => setForm(f => ({ ...f, dataset: ds.name, datasetId: ds.id }))}
                    className={`w-full text-left px-4 py-3 rounded border transition flex items-center justify-between ${
                      form.dataset === ds.name
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{ds.name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{ds.rows} rows · {ds.file}</p>
                    </div>
                    {form.dataset === ds.name && <Check size={14} className="text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-2xl space-y-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Prompt Template</label>
              <p className="text-xs text-muted-foreground mb-3">Use <code className="text-accent bg-accent/10 px-1 rounded">{"{{input}}"}</code> where the dataset row should be injected.</p>
              <textarea
                rows={10}
                className="w-full bg-input-background border border-border rounded px-3 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition resize-none"
                placeholder={"You are a helpful assistant.\n\nAnswer the following question accurately and concisely.\n\nQuestion: {{input}}\n\nAnswer:"}
                value={form.promptTemplate}
                onChange={e => setForm(f => ({ ...f, promptTemplate: e.target.value }))}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-lg space-y-3">
            <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Select Judge Models <span className="text-muted-foreground/60">(select one or more)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {JUDGE_MODELS.map(m => {
                const selected = form.judges.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleJudge(m.id)}
                    className={`px-4 py-3 rounded border transition text-left ${
                      selected ? "border-accent bg-accent/10" : "border-border bg-muted/20 hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-mono uppercase tracking-widest ${m.provider === "OpenAI" ? "text-chart-1" : "text-chart-2"}`}>{m.provider}</span>
                      {selected && <Check size={12} className="text-accent" />}
                    </div>
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-lg space-y-3">
            <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Model to Evaluate</label>
            <div className="grid grid-cols-2 gap-2">
              {EVAL_MODELS.map(m => {
                const selected = form.evalModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setForm(f => ({ ...f, evalModel: m.id }))}
                    className={`px-4 py-3 rounded border transition text-left ${
                      selected ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-mono uppercase tracking-widest ${m.provider === "OpenAI" ? "text-chart-1" : "text-chart-2"}`}>{m.provider}</span>
                      {selected && <Check size={12} className="text-primary" />}
                    </div>
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-lg space-y-4">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Review & Launch</p>
            {[
              { label: "Experiment", value: form.name },
              { label: "Dataset", value: form.dataset },
              { label: "Prompt", value: form.promptTemplate.slice(0, 60) + (form.promptTemplate.length > 60 ? "…" : "") },
              { label: "Judges", value: form.judges.map(j => JUDGE_MODELS.find(m => m.id === j)?.label).join(", ") },
              { label: "Eval Model", value: EVAL_MODELS.find(m => m.id === form.evalModel)?.label || form.evalModel },
            ].map(row => (
              <div key={row.label} className="flex gap-4 pb-4 border-b border-border/50 last:border-0">
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground w-28 shrink-0">{row.label}</span>
                <span className="text-sm text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 mt-4 border-t border-border">
        <button
          onClick={step === 0 ? onCancel : () => setStep(s => s - 1)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition rounded border border-border hover:border-border/80"
        >
          <ChevronLeft size={14} />
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <button
          onClick={() => {
            if (step < steps.length - 1) setStep(s => s + 1);
            else onSubmit(form);
          }}
          disabled={!canNext()}
          className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {step === steps.length - 1 ? (
            <><Play size={13} /> Start Evaluation</>
          ) : (
            <>Continue <ChevronRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (ds: Dataset) => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const submit = () => {
    if (!name.trim() || !file) return;
    // upload to backend
    const form = new FormData();
    form.append("name", name.trim());
    form.append("file", file);
    fetch("http://localhost:8000/datasets/upload", { method: "POST", body: form })
      .then(async res => {
        if (!res.ok) {
          // try parse json error body, fallback to text
          let msg = "Upload failed";
          try {
            const j = await res.json();
            msg = j.detail || j.error || JSON.stringify(j);
          } catch (e) {
            msg = await res.text();
          }
          throw new Error(msg || `Status ${res.status}`);
        }
        return res.json();
      })
      .then((ds: any) => {
        onUpload({ id: String(ds.id), name: ds.name, rows: ds.rows || 0, uploadedAt: ds.uploaded_at ? ds.uploaded_at.split("T")[0] : "", file: ds.file_name });
        onClose();
      })
      .catch(err => {
        console.error(err);
        // surface error to user
        notify(err?.message || "Failed to upload dataset");
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold">Upload Dataset</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Dataset Name</label>
            <input
              className="w-full bg-input-background border border-border rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition"
              placeholder="e.g. Customer Support Q&A v3"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">File <span className="text-muted-foreground/50">.csv / .json / .jsonl</span></label>
            <label
              className={`block w-full border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
                dragging ? "border-accent bg-accent/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept=".csv,.json,.jsonl" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <Upload size={20} className={`mx-auto mb-2 ${file ? "text-accent" : "text-muted-foreground"}`} />
              {file ? (
                <p className="text-sm font-mono text-accent">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Drop your file here or click to browse</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Supports CSV, JSON, JSONL</p>
                </>
              )}
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-border rounded hover:border-border/80 text-muted-foreground hover:text-foreground transition">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !file}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            Upload Dataset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // load data
  useEffect(() => {
    fetchDatasets();
    fetchExperiments();
    fetchDashboard();
  }, []);

  async function fetchDatasets() {
    try {
      const res = await fetch("http://localhost:8000/datasets");
      const data = await res.json();
      setDatasets(data.map((d: any) => ({ id: String(d.id), name: d.name, rows: d.rows || 0, uploadedAt: d.uploaded_at ? d.uploaded_at.split("T")[0] : "", file: d.file_name })));
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchExperiments() {
    try {
      const res = await fetch("http://localhost:8000/experiments");
      const data = await res.json();
      setExperiments(data.map((e: any) => ({ id: String(e.id), name: e.name, dataset: e.dataset_id ? String(e.dataset_id) : "", promptTemplate: e.prompt_template || "", judges: (e.judges || "").split(",").filter(Boolean), evalModel: e.eval_model || "", status: e.status || "running", createdAt: e.created_at ? e.created_at.split("T")[0] : "", score: e.score || 0 })));
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchDashboard() {
    try {
      const res = await fetch("http://localhost:8000/dashboard");
      const data = await res.json();
      setDashboardData(data);
    } catch (e) {
      console.error(e);
    }
  }

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const addDataset = async (ds: Dataset) => {
    // ds contains a file name and name; refresh from backend
    await fetchDatasets();
    notify(`Dataset "${ds.name}" uploaded successfully`);
  };

  const deleteDataset = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/datasets/${id}`, { method: "DELETE" });
      await fetchDatasets();
      notify("Dataset removed");
    } catch (e) {
      console.error(e);
    }
  };

  const addExperiment = async (form: Omit<Experiment, "id" | "status" | "createdAt" | "score">) => {
    try {
      const body = {
        name: form.name,
        dataset_id: Number(form.datasetId) || null,
        prompt_template: form.promptTemplate,
        judges: form.judges,
        eval_model: form.evalModel,
      };
      const res = await fetch("http://localhost:8000/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchExperiments();
        setView("experiments");
        notify(`Evaluation "${form.name}" started`);
      } else {
        const txt = await res.text();
        notify(`Failed to start evaluation: ${txt}`);
      }
    } catch (e) {
      console.error(e);
      notify("Failed to start evaluation");
    }
  };

  const navItems = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
    { id: "datasets" as View, label: "Datasets", icon: Database },
    { id: "experiments" as View, label: "Experiments", icon: FlaskConical },
  ];

  const completedExps = experiments.filter(e => e.status === "completed");
  const avgScore = completedExps.length
    ? Math.round((completedExps.reduce((s, e) => s + e.score, 0) / completedExps.length) * 10) / 10
    : 0;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden" style={{ fontFamily: "'Geist', 'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar py-5">
        <div className="px-5 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Scale size={13} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">EvalKit</span>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-1 tracking-widest uppercase">LLM Evaluation</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition ${
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon size={15} />
                {item.label}
                {item.id === "experiments" && experiments.some(e => e.status === "running") && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 mt-auto pt-4 border-t border-sidebar-border">
          <button
            onClick={() => setView("new-experiment")}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus size={14} />
            New Experiment
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="shrink-0 h-14 border-b border-border flex items-center px-8 gap-3">
          <div className="flex-1">
            <h1 className="text-sm font-semibold">
              {view === "dashboard" && "Dashboard"}
              {view === "datasets" && "Datasets"}
              {view === "experiments" && "Experiments"}
              {view === "new-experiment" && "New Experiment"}
            </h1>
          </div>
          {view === "datasets" && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded bg-primary text-primary-foreground hover:bg-primary/90 transition"
            >
              <Upload size={12} /> Upload Dataset
            </button>
          )}
          {view === "experiments" && (
            <button
              onClick={() => setView("new-experiment")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded bg-primary text-primary-foreground hover:bg-primary/90 transition"
            >
              <Plus size={12} /> New
            </button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-7">

          {/* ── Dashboard ── */}
          {view === "dashboard" && (
            <div className="space-y-7">
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Experiments", value: experiments.length, icon: FlaskConical, sub: `${experiments.filter(e => e.status === "running").length} running` },
                  { label: "Datasets", value: datasets.length, icon: Database, sub: `${datasets.reduce((s, d) => s + d.rows, 0).toLocaleString()} total rows` },
                  { label: "Avg Score", value: `${avgScore}%`, icon: BarChart2, sub: `across ${completedExps.length} completed` },
                  { label: "Pass Rate", value: `${dashboardData?.results ? Math.round((dashboardData.results.filter((r:any) => r.verdict === "pass").length / Math.max(1, dashboardData.results.length)) * 100) : "—"}%`, icon: TrendingUp, sub: `${dashboardData?.results ? dashboardData.results.filter((r:any) => r.verdict === "pass").length : 0}/${dashboardData?.results ? dashboardData.results.length : 0} evaluations` },
                ].map(card => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="bg-card border border-border rounded-lg p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{card.label}</span>
                        <Icon size={14} className="text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-semibold">{card.value}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{card.sub}</p>
                    </div>
                  );
                })}
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-lg p-5">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Score Over Runs</p>
                  <p className="text-sm font-medium mb-5">Model Performance Trend</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={(dashboardData?.score_over_runs || [])} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(64,95,250,0.08)" />
                      <XAxis dataKey="run" tick={{ fill: "#6b80a0", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis domain={[55, 100]} tick={{ fill: "#6b80a0", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Line type="monotone" dataKey="score" stroke="#405ffa" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-border rounded-lg p-5">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">By Criterion</p>
                  <p className="text-sm font-medium mb-5">Evaluation Criteria Breakdown</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={(dashboardData?.criteria_scores || []).map((c:any)=> ({ criterion: c.criterion, value: c.value }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(64,95,250,0.08)" />
                      <XAxis dataKey="criterion" tick={{ fill: "#6b80a0", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis domain={[50, 100]} tick={{ fill: "#6b80a0", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Bar dataKey="value" fill="#405ffa" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Results table */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-medium">Recent Evaluation Results</p>
                  <span className="text-xs font-mono text-muted-foreground">{dashboardData?.results ? dashboardData.results.length : 0} entries</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["#", "Prompt", "Model", "Criteria", "Score", "Verdict"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardData?.results || []).map((row: any, i: number) => (
                        <tr key={row.id} className={`border-b border-border/50 hover:bg-muted/20 transition ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                          <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.id}</td>
                          <td className="px-5 py-3 max-w-xs">
                            <p className="truncate text-foreground">{row.prompt || ''}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs font-mono text-chart-1">{row.model}</span>
                          </td>
                          <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{row.criteria || ''}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${row.judge_score}%`,
                                    background: row.judge_score >= 80 ? "#09bbc8" : row.judge_score >= 60 ? "#405ffa" : "#e5484d",
                                  }}
                                />
                              </div>
                              <span className="text-xs font-mono text-foreground">{row.judge_score}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded ${
                              row.verdict === "pass"
                                ? "bg-accent/10 text-accent"
                                : "bg-destructive/10 text-destructive"
                            }`}>
                              {row.verdict === "pass" ? <Check size={9} /> : <AlertCircle size={9} />}
                              {row.verdict}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Datasets ── */}
          {view === "datasets" && (
            <div className="space-y-4">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{datasets.length} datasets</p>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "File", "Rows", "Uploaded", ""].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.map((ds, i) => (
                      <tr key={ds.id} className={`border-b border-border/50 hover:bg-muted/20 transition ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded bg-secondary/40 flex items-center justify-center shrink-0">
                              <Database size={12} className="text-accent" />
                            </div>
                            <span className="font-medium">{ds.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <FileText size={11} />
                            {ds.file}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs">{ds.rows.toLocaleString()}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{ds.uploadedAt}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => deleteDataset(ds.id)}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {datasets.length === 0 && (
                  <div className="px-5 py-14 text-center">
                    <Database size={28} className="mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No datasets yet</p>
                    <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-primary hover:underline">Upload your first dataset</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Experiments ── */}
          {view === "experiments" && (
            <div className="space-y-4">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{experiments.length} experiments</p>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Dataset", "Eval Model", "Judges", "Score", "Status", "Date"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.map((exp, i) => (
                      <tr key={exp.id} className={`border-b border-border/50 hover:bg-muted/20 transition ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded bg-secondary/40 flex items-center justify-center shrink-0">
                              <Cpu size={12} className="text-primary" />
                            </div>
                            <span className="font-medium">{exp.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground">{datasets.find(d => d.id === exp.dataset)?.name || exp.dataset}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-chart-1">{exp.evalModel}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1 flex-wrap">
                            {exp.judges.map(j => (
                              <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">{j}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs">
                          {exp.status === "completed" ? (
                            <span className="text-accent">{exp.score}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded ${
                            exp.status === "completed" ? "bg-accent/10 text-accent"
                            : exp.status === "running" ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive"
                          }`}>
                            {exp.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                            {exp.status === "completed" && <Check size={9} />}
                            {exp.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{exp.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── New Experiment ── */}
          {view === "new-experiment" && (
            <div className="max-w-3xl h-full flex flex-col">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-8">Configure Evaluation Run</p>
              <NewExperimentWizard
                datasets={datasets}
                onSubmit={addExperiment}
                onCancel={() => setView("experiments")}
              />
            </div>
          )}
        </div>
      </main>

      {/* Upload modal */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUpload={addDataset} />}

      {/* Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-card border border-accent/30 text-foreground text-sm px-4 py-3 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-300">
          <Check size={14} className="text-accent shrink-0" />
          {notification}
        </div>
      )}
    </div>
  );
}
