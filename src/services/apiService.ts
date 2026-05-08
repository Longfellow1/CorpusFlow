const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;
const TOKEN_STORAGE_KEY = "corpusflow.authToken";
const EMAIL_STORAGE_KEY = "corpusflow.userEmail";

let authToken = "";

function getHeaders(contentType = true) {
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getHeaders(options.body ? true : false),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    let message = rawMessage;
    try {
      const parsed = JSON.parse(rawMessage) as { error?: string; detail?: string; message?: string };
      message = parsed.error || parsed.detail || parsed.message || rawMessage;
    } catch {
      message = rawMessage;
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type ApiTask = {
  id: string;
  name: string;
  time: string;
  status: "running" | "completed" | "idle";
  active?: boolean;
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
};

export const apiService = {
  setToken(token: string) {
    authToken = token;
  },

  setSession(token: string, email: string) {
    authToken = token;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
  },

  getStoredSession() {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    const email = window.localStorage.getItem(EMAIL_STORAGE_KEY) || "";
    if (token) {
      authToken = token;
    }
    return { token, email };
  },

  clearToken() {
    authToken = "";
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  },

  async login(email: string, password: string) {
    return request<{ token: string; user: { email: string; id: string; displayName: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
  },

  async getHealth() {
    return request("/api/health");
  },

  async getTasks() {
    return request<ApiTask[]>("/api/tasks");
  },

  async createTask(payload: {
    name: string;
    businessType?: "evaluation" | "training";
    workMode?: "quick" | "advanced";
  }) {
    return request<ApiTask>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateTask(taskId: string, payload: { name: string }) {
    return request<ApiTask>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteTask(taskId: string) {
    return request<{ success: boolean }>(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
  },

  async getSeeds(taskId: string) {
    return request<any[]>(`/api/tasks/${taskId}/seeds`);
  },

  async saveSeeds(taskId: string, seeds: any[]) {
    return request<any[]>(`/api/tasks/${taskId}/seeds`, {
      method: "POST",
      body: JSON.stringify(seeds),
    });
  },

  async getGenerated(taskId: string) {
    return request<any[]>(`/api/tasks/${taskId}/generated`);
  },

  async saveGenerated(taskId: string, generated: any[]) {
    return request<any[]>(`/api/tasks/${taskId}/generated`, {
      method: "POST",
      body: JSON.stringify(generated),
    });
  },

  async getWorkspace<T = any>(taskId: string) {
    return request<T | null>(`/api/tasks/${taskId}/workspace`);
  },

  async saveWorkspace<T = any>(taskId: string, workspace: T) {
    return request<T>(`/api/tasks/${taskId}/workspace`, {
      method: "POST",
      body: JSON.stringify(workspace),
    });
  },

  async generate(taskId: string, payload: any) {
    return request<{ items: any[]; meta: { count: number; mode: string } }>(
      `/api/tasks/${taskId}/generate`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async quickGenerate(payload: {
    job_id?: string;
    seeds: string[];
    type: "qa" | "multi" | "instruct";
    multi_turn?: boolean;
    target_per_seed: number;
    filter_strength: "loose" | "medium" | "strict";
    concurrency?: number;
    instruction_template?: string;
    system_prompt?: string;
    seed_instructions?: string[];
    seed_systems?: string[];
    seed_inputs?: string[];
    seed_outputs?: string[];
    seed_histories?: string[];
    diversity?: number;
    generation_intent?: string;
  }, signal?: AbortSignal) {
    return request<{
      job_id?: string;
      status?: "done" | "cancelled";
      items: Array<{
        id?: string;
        seed_index?: number;
        q?: string;
        a?: string;
        system?: string;
        instruction?: string;
        input?: string;
        output?: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        currentQuery?: string;
        response?: string;
        conversations?: Array<{ from: string; value: string }>;
      }>;
      errors?: Array<{ seed_index?: number; error?: string }> | null;
      stats: {
        seeds_count: number;
        total_generated: number;
        total_retained: number;
        pass_rate: number;
      };
    }>("/api/algorithm/quick-generate", {
      method: "POST",
      signal,
      body: JSON.stringify(payload),
    });
  },

  async cancelQuickGenerate(jobId: string) {
    return request<{ success: boolean; status?: string }>(
      `/api/algorithm/quick-generate/${jobId}/pause`,
      { method: "POST" },
    );
  },

  async pauseQuickGenerate(jobId: string) {
    return this.cancelQuickGenerate(jobId);
  },

  async getQuickGenerateProgress(jobId: string) {
    return request<{
      total: number;
      done: number;
      errors: number;
      status: "running" | "done" | "cancelled";
      completed_items?: any[];
    }>(`/api/algorithm/progress/${encodeURIComponent(jobId)}`);
  },

  async export(taskId: string, payload: any) {
    return request<{ format: string; recordCount: number; content: string }>(
      `/api/tasks/${taskId}/export`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
