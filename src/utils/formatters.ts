import type { TaskStatus, TaskPhase, TaskPriority, InsuranceStatus, LightingCheckStatus, ExhibitStatus, AuditLogType } from '../../../shared/types';

export function statusLabel(s: TaskStatus): string {
  switch (s) {
    case 'pending': return '待办';
    case 'in_progress': return '进行中';
    case 'completed': return '已完成';
    case 'blocked': return '阻塞';
    default: return s || '';
  }
}

export function statusColor(s: TaskStatus): string {
  switch (s) {
    case 'pending': return 'bg-slate-100 text-slate-700';
    case 'in_progress': return 'bg-blue-100 text-blue-700';
    case 'completed': return 'bg-emerald-100 text-emerald-700';
    case 'blocked': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export function priorityLabel(p: TaskPriority): string {
  switch (p) {
    case 'low': return '低';
    case 'medium': return '中';
    case 'high': return '高';
    case 'critical': return '紧急';
    default: return p || '';
  }
}

export function priorityColor(p: TaskPriority): string {
  switch (p) {
    case 'low': return 'bg-slate-100 text-slate-600';
    case 'medium': return 'bg-indigo-50 text-indigo-700';
    case 'high': return 'bg-orange-50 text-orange-700';
    case 'critical': return 'bg-red-50 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function phaseLabel(p: TaskPhase | 'unassigned'): string {
  switch (p) {
    case 'pre_exhibition': return '预展';
    case 'opening': return '开幕';
    case 'teardown': return '撤展';
    case 'unassigned': return '未分配';
    default: return p || '';
  }
}

export function phaseColor(p: TaskPhase | undefined): string {
  switch (p) {
    case 'pre_exhibition': return 'bg-indigo-100 text-indigo-700';
    case 'opening': return 'bg-emerald-100 text-emerald-700';
    case 'teardown': return 'bg-rose-100 text-rose-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export function categoryLabel(c: string): string {
  switch (c) {
    case 'wall_install': return '展墙安装';
    case 'installation': return '装置吊装';
    case 'framing': return '装裱';
    case 'lighting': return '灯光调试';
    case 'exhibit_placement': return '展品布置';
    case 'condition_check': return '状态复核';
    case 'label_printing': return '标签打印';
    case 'cleaning': return '清场清洁';
    default: return c || '';
  }
}

export function insuranceStatusLabel(s: InsuranceStatus): string {
  switch (s) {
    case 'not_set': return '未设置';
    case 'pending': return '办理中';
    case 'covered': return '已覆盖';
    case 'not_required': return '不适用';
    default: return s || '';
  }
}

export function insuranceColor(s: InsuranceStatus): string {
  switch (s) {
    case 'not_set': return 'bg-slate-100 text-slate-600';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'covered': return 'bg-emerald-100 text-emerald-700';
    case 'not_required': return 'bg-slate-50 text-slate-500';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function lightingCheckLabel(s: LightingCheckStatus): string {
  switch (s) {
    case 'not_required': return '不适用';
    case 'pending': return '待校验';
    case 'passed': return '已通过';
    case 'failed': return '不达标';
    default: return s || '';
  }
}

export function lightingColor(s: LightingCheckStatus): string {
  switch (s) {
    case 'not_required': return 'bg-slate-50 text-slate-500';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'passed': return 'bg-emerald-100 text-emerald-700';
    case 'failed': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function exhibitStatusLabel(s: ExhibitStatus): string {
  switch (s) {
    case 'not_arrived': return '未到货';
    case 'in_transit': return '运输中';
    case 'arrived': return '已到货';
    case 'in_storage': return '入库';
    case 'on_display': return '展出中';
    case 'removed': return '已撤展';
    default: return s || '';
  }
}

export function exhibitStatusColor(s: ExhibitStatus): string {
  switch (s) {
    case 'not_arrived': return 'bg-slate-100 text-slate-600';
    case 'in_transit': return 'bg-blue-100 text-blue-700';
    case 'arrived': return 'bg-indigo-100 text-indigo-700';
    case 'in_storage': return 'bg-violet-100 text-violet-700';
    case 'on_display': return 'bg-emerald-100 text-emerald-700';
    case 'removed': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function auditLogTypeLabel(t: AuditLogType): string {
  switch (t) {
    case 'reschedule': return '改期';
    case 'review': return '复核';
    case 'closure': return '封闭';
    case 'anomaly': return '异常';
    case 'phase_change': return '阶段切换';
    default: return t || '';
  }
}

export function auditLogTypeColor(t: AuditLogType): string {
  switch (t) {
    case 'reschedule': return 'bg-blue-100 text-blue-700';
    case 'review': return 'bg-emerald-100 text-emerald-700';
    case 'closure': return 'bg-amber-100 text-amber-700';
    case 'anomaly': return 'bg-red-100 text-red-700';
    case 'phase_change': return 'bg-violet-100 text-violet-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}
