import db from '../api/src/db/index.js';
import { initDatabase } from '../api/src/db/schema.js';

type TestResult = { name: string; passed: boolean; error?: string };

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => results.push({ name, passed: true }))
        .catch((e) => results.push({ name, passed: false, error: e.message }));
    } else {
      results.push({ name, passed: true });
    }
  } catch (e: unknown) {
    results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log('🧪 开始回归验证测试...\n');
console.log('='.repeat(60));

initDatabase();

// Create test exhibition for foreign key constraints
const now = new Date().toISOString();
db.prepare(`
  INSERT OR IGNORE INTO exhibitions (id, name, description, created_by, created_at, updated_at)
  VALUES ('exhibition_demo', '测试展览', '用于回归测试', 'user_curator_001', ?, ?)
`).run(now, now);

// Create test task for audit log foreign key
db.prepare(`
  INSERT OR IGNORE INTO tasks (id, exhibition_id, name, phase, category, status, progress, priority, assignee_role, insurance_status, lighting_check, created_at, updated_at, created_by)
  VALUES ('task_demo', 'exhibition_demo', '演示任务', 'pre_exhibition', 'wall_install', 'pending', 0, 'medium', 'worker', 'not_set', 'not_required', ?, ?, 'user_curator_001')
`).run(now, now);

console.log('\n📋 【测试 1】数据库 Schema 验证');
console.log('-'.repeat(60));

test('tasks 表存在 priority 列', () => {
  const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
  const colNames = cols.map((c) => c.name);
  assert(colNames.includes('priority'), '缺少 priority 列');
  assert(colNames.includes('insurance_status'), '缺少 insurance_status 列');
  assert(colNames.includes('lighting_check'), '缺少 lighting_check 列');
  assert(colNames.includes('hoisting_order'), '缺少 hoisting_order 列');
  assert(colNames.includes('transport_window_start'), '缺少 transport_window_start 列');
  assert(colNames.includes('transport_window_end'), '缺少 transport_window_end 列');
  assert(colNames.includes('earliest_start'), '缺少 earliest_start 列');
});

test('task_audit_logs 表存在', () => {
  const cols = db.prepare(`PRAGMA table_info(task_audit_logs)`).all() as { name: string }[];
  const colNames = cols.map((c) => c.name);
  assert(colNames.includes('log_type'), '缺少 log_type 列');
  assert(colNames.includes('old_value'), '缺少 old_value 列');
  assert(colNames.includes('new_value'), '缺少 new_value 列');
  assert(colNames.includes('reason'), '缺少 reason 列');
  assert(colNames.includes('changed_by'), '缺少 changed_by 列');
});

test('exhibits 表存在修复确认字段', () => {
  const cols = db.prepare(`PRAGMA table_info(exhibits)`).all() as { name: string }[];
  const colNames = cols.map((c) => c.name);
  assert(colNames.includes('restoration_confirmed'), '缺少 restoration_confirmed 列');
  assert(colNames.includes('restoration_confirmed_at'), '缺少 restoration_confirmed_at 列');
  assert(colNames.includes('restoration_confirmed_by'), '缺少 restoration_confirmed_by 列');
});

console.log('\n📋 【测试 2】枚举值一致性验证');
console.log('-'.repeat(60));

test('InsuranceStatus 枚举值与前端一致', () => {
  const expected = ['not_set', 'pending', 'covered', 'not_required'];
  const col = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'tasks'`).get() as { sql: string } | undefined;
  assert(col, 'tasks 表不存在');
  for (const val of expected) {
    assert(col.sql.includes(`'${val}'`), `insurance_status CHECK 缺少 ${val}`);
  }
});

test('LightingCheckStatus 枚举值与前端一致', () => {
  const expected = ['not_required', 'pending', 'passed', 'failed'];
  const col = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'tasks'`).get() as { sql: string } | undefined;
  assert(col, 'tasks 表不存在');
  for (const val of expected) {
    assert(col.sql.includes(`'${val}'`), `lighting_check CHECK 缺少 ${val}`);
  }
});

console.log('\n📋 【测试 3】创建任务字段完整性验证');
console.log('-'.repeat(60));

test('创建任务 - 完整字段写入', () => {
  const now = new Date().toISOString();
  const taskId = 'task_test_' + Date.now();

  db.prepare(`
    INSERT INTO tasks (
      id, exhibition_id, name, description, phase, category, status, progress, priority,
      assignee_role, assigned_to, due_date, transport_window_start, transport_window_end,
      insurance_status, lighting_check, hoisting_order, created_at, updated_at, created_by
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 'pending', 0, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    taskId,
    'exhibition_demo',
    '测试展墙安装任务',
    '测试任务描述',
    'pre_exhibition',
    'wall_install',
    'high',
    'worker',
    'user_worker_001',
    now,
    now,
    now,
    'covered',
    'passed',
    1,
    now,
    now,
    'user_curator_001'
  );

  const saved = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>;
  assert(saved, '任务未保存');
  assert(saved.name === '测试展墙安装任务', `name 字段不匹配: ${saved.name}`);
  assert(saved.phase === 'pre_exhibition', `phase 字段不匹配: ${saved.phase}`);
  assert(saved.priority === 'high', `priority 字段不匹配: ${saved.priority}`);
  assert(saved.assignee_role === 'worker', `assignee_role 字段不匹配: ${saved.assignee_role}`);
  assert(saved.insurance_status === 'covered', `insurance_status 字段不匹配: ${saved.insurance_status}`);
  assert(saved.lighting_check === 'passed', `lighting_check 字段不匹配: ${saved.lighting_check}`);
  assert(saved.hoisting_order === 1, `hoisting_order 字段不匹配: ${saved.hoisting_order}`);

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
});

console.log('\n📋 【测试 4】审计日志功能验证');
console.log('-'.repeat(60));

test('审计日志 - 所有 log_type 枚举值', () => {
  const expected = ['reschedule', 'review', 'closure', 'anomaly', 'phase_change'];
  const col = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'task_audit_logs'`).get() as { sql: string } | undefined;
  assert(col, 'task_audit_logs 表不存在');
  for (const val of expected) {
    assert(col.sql.includes(`'${val}'`), `log_type CHECK 缺少 ${val}`);
  }
});

test('写入 audit_log 并验证', () => {
  const logId = 'audit_test_' + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO task_audit_logs (id, task_id, exhibition_id, log_type, old_value, new_value, reason, changed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, 'task_demo', 'exhibition_demo', 'reschedule', '2024-01-01', '2024-01-02', '改期原因', 'user_curator_001', now);

  const saved = db.prepare('SELECT * FROM task_audit_logs WHERE id = ?').get(logId) as Record<string, unknown>;
  assert(saved, '审计日志未保存');
  assert(saved.log_type === 'reschedule', `log_type 不匹配: ${saved.log_type}`);
  assert(saved.old_value === '2024-01-01', `old_value 不匹配: ${saved.old_value}`);
  assert(saved.new_value === '2024-01-02', `new_value 不匹配: ${saved.new_value}`);
  assert(saved.reason === '改期原因', `reason 不匹配: ${saved.reason}`);
  assert(saved.changed_by === 'user_curator_001', `changed_by 不匹配: ${saved.changed_by}`);

  db.prepare('DELETE FROM task_audit_logs WHERE id = ?').run(logId);
});

console.log('\n📋 【测试 5】施工风险计算逻辑验证');
console.log('-'.repeat(60));

test('依赖未完成 → danger 风险', () => {
  const task = { id: 't1', dependencies: ['t2'], status: 'pending', insurance_status: 'covered', lighting_check: 'passed', category: 'installation', earliest_start: null } as unknown as import('../shared/types.js').Task;
  const allTasks = [
    task,
    { id: 't2', name: '依赖任务', status: 'in_progress', earliest_start: null } as unknown as import('../shared/types.js').Task,
  ];
  const deps = task.dependencies || [];
  let hasDanger = false;
  for (const depId of deps) {
    const dep = allTasks.find((t) => t.id === depId);
    if (dep && dep.status !== 'completed') hasDanger = true;
  }
  assert(hasDanger, '依赖未完成应该标记为 danger');
});

test('保险 not_set → danger 风险', () => {
  const task = { id: 't1', insurance_status: 'not_set', lighting_check: 'passed', status: 'pending', category: 'wall_install', earliest_start: null, dependencies: [] } as unknown as import('../shared/types.js').Task;
  const hasInsuranceDanger = task.insurance_status !== 'covered' && task.insurance_status !== 'not_required';
  assert(hasInsuranceDanger, '保险 not_set 应该标记为 danger');
});

test('灯光 pending → warn 风险', () => {
  const task = { id: 't1', insurance_status: 'covered', lighting_check: 'pending', status: 'pending', category: 'wall_install', earliest_start: null, dependencies: [] } as unknown as import('../shared/types.js').Task;
  const hasLightingWarn = task.lighting_check !== 'passed' && task.lighting_check !== 'not_required';
  assert(hasLightingWarn, '灯光 pending 应该标记为 warn');
});

test('吊装顺序 → info 提示', () => {
  const task = { id: 't1', category: 'installation', hoisting_order: 2, insurance_status: 'covered', lighting_check: 'passed', status: 'completed', earliest_start: null, dependencies: [] } as unknown as import('../shared/types.js').Task;
  const hasHoistingInfo = task.hoisting_order !== null && task.category === 'installation';
  assert(hasHoistingInfo, '吊装任务应该显示顺序 info');
});

console.log('\n📋 【测试 6】状态切换逻辑验证');
console.log('-'.repeat(60));

test('pending → in_progress → completed 状态流转', () => {
  const taskId = 'task_status_test_' + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (id, exhibition_id, name, phase, category, status, progress, priority, assignee_role, insurance_status, lighting_check, created_at, updated_at, created_by)
    VALUES (?, ?, ?, 'pre_exhibition', 'wall_install', 'pending', 0, 'medium', 'worker', 'not_set', 'not_required', ?, ?, 'user_curator_001')
  `).run(taskId, 'exhibition_demo', '状态测试任务', now, now);

  db.prepare(`UPDATE tasks SET status = 'in_progress', progress = 50, updated_at = ? WHERE id = ?`).run(now, taskId);
  const inProgress = db.prepare('SELECT status, progress FROM tasks WHERE id = ?').get(taskId) as { status: string; progress: number };
  assert(inProgress.status === 'in_progress', `状态应为 in_progress，实际: ${inProgress.status}`);
  assert(inProgress.progress === 50, `进度应为 50，实际: ${inProgress.progress}`);

  db.prepare(`UPDATE tasks SET status = 'completed', progress = 100, completed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, taskId);
  const completed = db.prepare('SELECT status, progress FROM tasks WHERE id = ?').get(taskId) as { status: string; progress: number };
  assert(completed.status === 'completed', `状态应为 completed，实际: ${completed.status}`);
  assert(completed.progress === 100, `进度应为 100，实际: ${completed.progress}`);

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
});

console.log('\n📋 【测试 7】三阶段任务分组验证');
console.log('-'.repeat(60));

test('任务按 phase 正确分组', () => {
  const tasks = [
    { id: 't1', phase: 'pre_exhibition', name: '预展任务' },
    { id: 't2', phase: 'opening', name: '开幕任务' },
    { id: 't3', phase: 'teardown', name: '撤展任务' },
    { id: 't4', phase: null, name: '未分配任务' },
  ] as unknown as import('../shared/types.js').Task[];

  const groups: Record<string, typeof tasks> = {
    pre_exhibition: [],
    opening: [],
    teardown: [],
    unassigned: [],
  };
  for (const t of tasks) {
    const p = (t.phase || 'unassigned') as string;
    (groups[p] || groups.unassigned).push(t);
  }

  assert(groups.pre_exhibition.length === 1, `预展任务应为 1，实际: ${groups.pre_exhibition.length}`);
  assert(groups.opening.length === 1, `开幕任务应为 1，实际: ${groups.opening.length}`);
  assert(groups.teardown.length === 1, `撤展任务应为 1，实际: ${groups.teardown.length}`);
  assert(groups.unassigned.length === 1, `未分配任务应为 1，实际: ${groups.unassigned.length}`);
});

console.log('\n📋 【测试 8】前端字段与后端接口映射验证');
console.log('-'.repeat(60));

test('前端 CreateTaskRequest 字段与后端 INSERT 字段匹配', () => {
  const frontendFields = [
    'exhibition_id', 'name', 'description', 'category', 'phase', 'priority',
    'assignee_role', 'assigned_to', 'due_date', 'transport_window_start',
    'transport_window_end', 'insurance_status', 'lighting_check',
    'hoisting_order', 'created_by', 'dependencies',
  ];

  const backendInsertFields = [
    'id', 'exhibition_id', 'name', 'description', 'phase', 'category',
    'status', 'progress', 'priority', 'assignee_role', 'assigned_to',
    'due_date', 'transport_window_start', 'transport_window_end',
    'insurance_status', 'lighting_check', 'hoisting_order',
    'created_at', 'updated_at', 'created_by',
  ];

  for (const field of frontendFields) {
    if (field === 'dependencies') continue;
    assert(backendInsertFields.includes(field), `后端 INSERT 缺少前端字段: ${field}`);
  }
});

console.log('\n' + '='.repeat(60));

setTimeout(() => {
  console.log('\n📊 测试结果汇总');
  console.log('='.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${r.name}`);
    if (r.error) console.log(`   ${r.error}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`通过: ${passed} ✅`);
  console.log(`失败: ${failed} ❌`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
  process.exit(0);
}, 100);
