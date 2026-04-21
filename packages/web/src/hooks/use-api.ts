import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  HealthResponse,
  StatusResponse,
  ProjectMetadata,
  CraftState,
  PilotRecord,
  AgentRecord,
  AgentUsageReport,
  BlackBoxEntry,
  IntercomMessage,
  VectorState,
  GlobalConfig,
  PilotConfig,
  ConfigResponse,
  CraftDiffResponse,
  CraftDiffFileResponse,
} from "@/types/api";


export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => apiClient.get<HealthResponse>("/api/v1/health"),
    refetchInterval: 30_000,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: () => apiClient.get<StatusResponse>("/api/v1/status"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => apiClient.get<ProjectMetadata[]>("/api/v1/projects"),
  });
}

export function useProject(name: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(name),
    queryFn: () => apiClient.get<ProjectMetadata>(`/api/v1/projects/${name}`),
  });
}

export function useCrafts(project: string) {
  return useQuery({
    queryKey: queryKeys.crafts.list(project),
    queryFn: () => apiClient.get<CraftState[]>(`/api/v1/projects/${project}/crafts`),
  });
}

export function useCraft(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.detail(project, callsign),
    queryFn: () => apiClient.get<CraftState>(`/api/v1/projects/${project}/crafts/${callsign}`),
  });
}

/** Cross-project craft listing — every craft tagged with its projectName. */
export type CraftWithProject = CraftState & { projectName: string };

export function useAllCrafts() {
  return useQuery({
    queryKey: ["crafts", "all"],
    queryFn: () => apiClient.get<CraftWithProject[]>("/api/v1/crafts"),
    refetchInterval: 5_000,
  });
}

export function useCraftBlackBox(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.blackBox(project, callsign),
    queryFn: () =>
      apiClient.get<BlackBoxEntry[]>(`/api/v1/projects/${project}/crafts/${callsign}/blackbox`),
  });
}

export function useCraftIntercom(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.intercom(project, callsign),
    queryFn: () =>
      apiClient.get<IntercomMessage[]>(`/api/v1/projects/${project}/crafts/${callsign}/intercom`),
  });
}

export function useClaimControls(project: string, callsign: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { pilotId: string }) =>
      apiClient.post(`/api/v1/projects/${project}/crafts/${callsign}/controls/claim`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.detail(project, callsign) });
    },
  });
}

export function useSendIntercom(project: string, callsign: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { from: string; seat: string; content: string }) =>
      apiClient.post(`/api/v1/projects/${project}/crafts/${callsign}/intercom`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.intercom(project, callsign) });
    },
  });
}

export function useCraftVectors(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.vectors(project, callsign),
    queryFn: () =>
      apiClient.get<VectorState[]>(`/api/v1/projects/${project}/crafts/${callsign}/vectors`),
  });
}

/**
 * Fetches the list of files changed between the craft branch and its base branch.
 * @see AIR-40
 */
export function useCraftDiff(projectName: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.diff(projectName, callsign),
    queryFn: () =>
      apiClient.get<CraftDiffResponse>(`/api/v1/projects/${projectName}/crafts/${callsign}/diff`),
  });
}

/**
 * Fetches the original/modified content pair for a single file in the craft diff.
 * Disabled when `filePath` is null.
 * @see AIR-40
 */
export function useCraftDiffFile(projectName: string, callsign: string, filePath: string | null) {
  return useQuery({
    queryKey: queryKeys.crafts.diffFile(projectName, callsign, filePath ?? ""),
    queryFn: () =>
      apiClient.get<CraftDiffFileResponse>(
        `/api/v1/projects/${projectName}/crafts/${callsign}/diff/files/${encodeURIComponent(filePath!)}`,
      ),
    enabled: filePath !== null,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => apiClient.get<AgentRecord[]>("/api/v1/agents"),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => apiClient.get<AgentRecord>(`/api/v1/agents/${id}`),
  });
}

export function useAgentUsage(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.usage(id),
    queryFn: () => apiClient.get<AgentUsageReport[]>(`/api/v1/agents/${id}/usage`),
  });
}

export function useTowerQueue(project: string) {
  return useQuery({
    queryKey: queryKeys.tower.queue(project),
    queryFn: () => apiClient.get<string[]>(`/api/v1/projects/${project}/tower`),
  });
}

export function usePilots(project: string) {
  return useQuery({
    queryKey: queryKeys.pilots.list(project),
    queryFn: () => apiClient.get<PilotRecord[]>(`/api/v1/projects/${project}/pilots`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      remoteUrl: string;
      categories: string[];
      checklist: Array<{ name: string; command: string; timeout?: number }>;
      mcpServers?: Record<
        string,
        { command: string; args: string[]; env?: Record<string, string> }
      >;
    }) => apiClient.post<ProjectMetadata>("/api/v1/projects", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

export function usePilot(project: string, id: string) {
  return useQuery({
    queryKey: queryKeys.pilots.detail(project, id),
    queryFn: () => apiClient.get<PilotRecord>(`/api/v1/projects/${project}/pilots/${id}`),
    enabled: !!project && !!id,
  });
}

export function useAllPilots() {
  return useQuery({
    queryKey: queryKeys.pilots.all(),
    queryFn: async () => {
      const projects = await apiClient.get<{ name: string }[]>("/api/v1/projects");
      const allPilots: Array<PilotRecord & { project: string }> = [];
      for (const p of projects) {
        const pilots = await apiClient.get<PilotRecord[]>(`/api/v1/projects/${p.name}/pilots`);
        for (const pilot of pilots) {
          allPilots.push({ ...pilot, project: p.name });
        }
      }
      return allPilots;
    },
  });
}

export function useCreatePilot(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { identifier: string; certifications: string[] }) =>
      apiClient.post<PilotRecord>(`/api/v1/projects/${project}/pilots`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.list(project) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.all() });
    },
  });
}

export function useUpdatePilot(project: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      certifications?: string[];
      mcpServers?: Record<
        string,
        { command: string; args: string[]; env?: Record<string, string> }
      >;
    }) => apiClient.patch<PilotRecord>(`/api/v1/projects/${project}/pilots/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.detail(project, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.list(project) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.all() });
    },
  });
}

export function useDeletePilot(project: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/api/v1/projects/${project}/pilots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.list(project) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.all() });
    },
  });
}

export function useLaunchCraft(project: string, callsign: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<CraftState>(`/api/v1/projects/${project}/crafts/${callsign}/launch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.detail(project, callsign) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.list(project) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.blackBox(project, callsign) });
    },
  });
}

export function useCreateCraft(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      callsign: string;
      branch: string;
      cargo: string;
      category: string;
      captain: string;
      firstOfficers?: string[];
      jumpseaters?: string[];
      flightPlan: Array<{ name: string; acceptanceCriteria: string }>;
    }) => apiClient.post<CraftState>(`/api/v1/projects/${project}/crafts`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.list(project) });
    },
  });
}

/**
 * Submit a spec document (YAML or JSON) to create a craft or perform a dry run.
 * Detects content type from the raw string: JSON when it starts with `{`, YAML otherwise.
 * @see RULE-SDD-1 through RULE-SDD-15
 */
export function useSubmitSpec(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, dryRun }: { content: string; dryRun: boolean }) => {
      const trimmed = content.trimStart();
      const contentType = trimmed.startsWith("{") ? "application/json" : "application/yaml";
      const url = `/api/v1/projects/${project}/crafts/from-spec${dryRun ? "?dryRun=true" : ""}`;
      return apiClient.postRaw<CraftState>(url, content, contentType);
    },
    onSuccess: (_, { dryRun }) => {
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: queryKeys.crafts.list(project) });
      }
    },
  });
}

import type { ChecklistTemplate, ChecklistBinding, ChecklistRunResult } from "@/types/checklist";

export function useChecklistTemplates() {
  return useQuery({
    queryKey: queryKeys.checklists.templates(),
    queryFn: () => apiClient.get<ChecklistTemplate[]>("/api/v1/checklists/templates"),
  });
}

export function useChecklistTemplate(id: string) {
  return useQuery({
    queryKey: queryKeys.checklists.template(id),
    queryFn: () => apiClient.get<ChecklistTemplate>(`/api/v1/checklists/templates/${id}`),
  });
}

export function useChecklistBindings() {
  return useQuery({
    queryKey: queryKeys.checklists.bindings(),
    queryFn: () => apiClient.get<ChecklistBinding[]>("/api/v1/checklists/bindings"),
  });
}

export function useCraftChecklistRuns(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.checklists.runs(project, callsign),
    queryFn: () =>
      apiClient.get<ChecklistRunResult[]>(
        `/api/v1/projects/${project}/crafts/${callsign}/checklists`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Config hooks
// ---------------------------------------------------------------------------

export function useGlobalConfig() {
  return useQuery({
    queryKey: queryKeys.config.global(),
    queryFn: () => apiClient.get<ConfigResponse<GlobalConfig>>("/api/v1/config/global"),
  });
}

export function usePatchGlobalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<GlobalConfig>) =>
      apiClient.patch<{ config: GlobalConfig }>("/api/v1/config/global", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.global() });
    },
  });
}

export function useProjectConfig(name: string) {
  return useQuery({
    queryKey: queryKeys.config.project(name),
    queryFn: () =>
      apiClient.get<ConfigResponse<ProjectMetadata>>(`/api/v1/projects/${name}/config`),
  });
}

export function usePatchProjectConfig(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProjectMetadata>) =>
      apiClient.patch<{ config: ProjectMetadata }>(`/api/v1/projects/${name}/config`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.project(name) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(name) });
    },
  });
}

export function usePilotConfig(id: string) {
  return useQuery({
    queryKey: queryKeys.config.pilot(id),
    queryFn: () =>
      apiClient.get<ConfigResponse<PilotConfig>>(`/api/v1/projects/_/pilots/${id}/config`),
  });
}

export function usePatchPilotConfig(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PilotConfig>) =>
      apiClient.patch<{ config: PilotConfig }>(`/api/v1/projects/_/pilots/${id}/config`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.pilot(id) });
    },
  });
}
