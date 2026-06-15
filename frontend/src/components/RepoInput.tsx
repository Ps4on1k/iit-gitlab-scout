import { useState } from "react";

interface Props {
  onAnalyze: (project: string) => void;
  loading: boolean;
}

export function RepoInput({ onAnalyze, loading }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onAnalyze(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/repo"
        style={{ flex: 1, padding: 8, fontSize: 16 }}
      />
      <button type="submit" disabled={loading || !value.trim()} style={{ padding: "8px 16px" }}>
        {loading ? "Анализ..." : "Анализировать"}
      </button>
    </form>
  );
}
