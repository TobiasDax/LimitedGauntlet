import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  status: string;
}

function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<HealthResponse> => {
      const res = await fetch("/api/healthz");
      if (!res.ok) throw new Error("health check failed");
      return res.json();
    },
  });
}

export default function App() {
  const { data, isLoading, isError } = useHealth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold">LimitedGauntlet</h1>
        <p className="text-slate-400">
          {isLoading && "checking API..."}
          {isError && "API unreachable"}
          {data && `API status: ${data.status}`}
        </p>
      </div>
    </div>
  );
}
