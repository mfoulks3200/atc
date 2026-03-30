import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  HealthResponse,
  StatusResponse,
  ProjectMetadata,
  CraftState,
  AgentRecord,
  AgentUsageReport,
  BlackBoxEntry,
  IntercomMessage,
  VectorState,
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

export function useCraftVectors(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.vectors(project, callsign),
    queryFn: () =>
      apiClient.get<VectorState[]>(`/api/v1/projects/${project}/crafts/${callsign}/vectors`),
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
