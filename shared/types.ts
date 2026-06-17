export type UserRole = "curator" | "worker" | "director";

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export type TaskPhase = "pre_exhibition" | "opening" | "teardown";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskCategory =
  | "wall_install"
  | "installation"
  | "framing"
  | "lighting"
  | "exhibit_placement"
  | "condition_check"
  | "label_printing"
  | "cleaning"
  | "planning"
  | "design"
  | "construction"
  | "quality_check"
  | "opening_preparation";

export type InsuranceStatus = "not_set" | "pending" | "covered" | "not_required";

export type LightingCheckStatus = "not_required" | "pending" | "passed" | "failed";

export type ExhibitStatus = "not_arrived" | "in_transit" | "arrived" | "in_storage" | "on_display" | "removed" | "in_position";

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Exhibition {
  id: string;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  opening_confirmed: boolean;
  opening_confirmed_at: string | null;
  opening_confirmed_by: string | null;
  read_only: boolean;
  anomaly_readonly: boolean;
  anomaly_reason: string | null;
  anomaly_at: string | null;
  anomaly_by: string | null;
  teardown_responsible: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Task {
  id: string;
  exhibition_id: string;
  name: string;
  description: string;
  category: TaskCategory;
  phase: TaskPhase;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  assignee_role: UserRole;
  assigned_to: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  transport_window_start: string | null;
  transport_window_end: string | null;
  insurance_status: InsuranceStatus;
  lighting_check: LightingCheckStatus;
  hoisting_order: number | null;
  earliest_start: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CreateTaskRequest {
  exhibition_id: string;
  name: string;
  description?: string;
  category: TaskCategory;
  phase: TaskPhase;
  priority: TaskPriority;
  assignee_role: UserRole;
  assigned_to?: string;
  due_date?: string;
  transport_window_start?: string;
  transport_window_end?: string;
  insurance_status?: InsuranceStatus;
  lighting_check?: LightingCheckStatus;
  hoisting_order?: number;
  created_by: string;
  dependencies?: string[];
  reason?: string;
  estimated_hours?: number;
}

export interface CreateExhibitionRequest {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  created_by: string;
}

export interface CreateExhibitRequest {
  exhibition_id: string;
  name: string;
  artist?: string;
  year?: string;
  is_key_exhibit?: boolean;
  needs_thermostat?: boolean;
  status?: ExhibitStatus;
  position?: string;
  placement_task_id?: string;
  created_by: string;
}

export interface UpdateTaskProgressRequest {
  status: TaskStatus;
  progress?: number;
  comment?: string;
  updated_by: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

export interface Exhibit {
  id: string;
  exhibition_id: string;
  name: string;
  artist: string | null;
  year: string | null;
  is_key_exhibit: boolean;
  needs_thermostat: boolean;
  thermostat_confirmed: boolean;
  thermostat_confirmed_at: string | null;
  thermostat_confirmed_by: string | null;
  restoration_confirmed: boolean;
  restoration_confirmed_at: string | null;
  restoration_confirmed_by: string | null;
  placement_task_id: string | null;
  status: ExhibitStatus;
  position: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressUpdate {
  id: string;
  task_id: string;
  progress: number;
  status: TaskStatus;
  comment: string | null;
  updated_by: string;
  created_at: string;
}

export type AuditLogType = "reschedule" | "review" | "closure" | "anomaly" | "phase_change";

export interface TaskAuditLog {
  id: string;
  task_id: string;
  exhibition_id: string;
  log_type: AuditLogType;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string;
  created_at: string;
}

export interface ExhibitionWithDetails extends Exhibition {
  tasks: (Task & {
    dependencies: string[];
    dependents: string[];
    progress_updates: ProgressUpdate[];
    audit_logs: TaskAuditLog[];
  })[];
  exhibits: Exhibit[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
