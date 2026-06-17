#!/bin/bash
set -e
BASE="http://localhost:18381/api"

echo "=== 1. 创建展区 ==="
EXH=$(curl -s -X POST $BASE/exhibitions -H 'Content-Type: application/json' \
  -d '{"name":"测试展","description":"端到端测试","created_by":"user_curator_001"}')
echo "$EXH"
EXH_ID=$(echo "$EXH" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
echo "展区ID: $EXH_ID"

echo -e "\n=== 2. 创建3个任务: 规划->搭建->吊装 ==="
T1=$(curl -s -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d "{\"exhibition_id\":\"$EXH_ID\",\"name\":\"策展规划\",\"category\":\"planning\",\"assignee_role\":\"curator\",\"created_by\":\"user_curator_001\"}")
T1_ID=$(echo "$T1" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

T2=$(curl -s -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d "{\"exhibition_id\":\"$EXH_ID\",\"name\":\"展区搭建\",\"category\":\"construction\",\"assignee_role\":\"worker\",\"created_by\":\"user_curator_001\"}")
T2_ID=$(echo "$T2" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

T3=$(curl -s -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d "{\"exhibition_id\":\"$EXH_ID\",\"name\":\"展墙吊装\",\"category\":\"installation\",\"assignee_role\":\"worker\",\"created_by\":\"user_curator_001\"}")
T3_ID=$(echo "$T3" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

echo "规划: $T1_ID | 搭建: $T2_ID | 吊装: $T3_ID"

echo -e "\n=== 3. 吊装依赖搭建 ==="
curl -s -X POST $BASE/tasks/$T3_ID/dependencies -H 'Content-Type: application/json' \
  -d "{\"depends_on_task_id\":\"$T2_ID\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['success'] and 'OK' or d['error'])"

echo -e "\n=== 4. 尝试启动吊装(前置未完成,应失败) ==="
R=$(curl -s -X POST $BASE/tasks/$T3_ID/update-progress -H 'Content-Type: application/json' \
  -d "{\"progress\":10,\"status\":\"in_progress\",\"updated_by\":\"user_worker_001\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('结果:', d.get('success'), d.get('error',''))"

echo -e "\n=== 5. 完成搭建任务 ==="
curl -s -X POST $BASE/tasks/$T2_ID/update-progress -H 'Content-Type: application/json' \
  -d "{\"progress\":100,\"status\":\"completed\",\"updated_by\":\"user_worker_001\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('搭建完成:', d.get('success'))"

echo -e "\n=== 6. 再次启动吊装(应成功) ==="
curl -s -X POST $BASE/tasks/$T3_ID/update-progress -H 'Content-Type: application/json' \
  -d "{\"progress\":50,\"status\":\"in_progress\",\"updated_by\":\"user_worker_001\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('吊装启动:', d.get('success'), d.get('error',''))"

echo -e "\n=== 7. 创建重点展品(需恒温柜) ==="
E=$(curl -s -X POST $BASE/exhibits -H 'Content-Type: application/json' \
  -d "{\"exhibition_id\":\"$EXH_ID\",\"name\":\"镇馆之宝\",\"artist\":\"佚名\",\"is_key_exhibit\":true,\"needs_thermostat\":true}")
E_ID=$(echo "$E" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
echo "展品ID: $E_ID"

echo -e "\n=== 8. 馆长确认开幕(吊装未完成+恒温柜未确认,应失败) ==="
curl -s -X POST $BASE/exhibitions/$EXH_ID/confirm-opening -H 'Content-Type: application/json' \
  -d "{\"confirmed_by\":\"user_director_001\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('开幕:', d.get('success'), d.get('error',''))"

echo -e "\n=== 9. 完成吊装 + 确认恒温柜 ==="
curl -s -X POST $BASE/tasks/$T3_ID/update-progress -H 'Content-Type: application/json' \
  -d "{\"progress\":100,\"status\":\"completed\",\"updated_by\":\"user_worker_001\"}" > /dev/null
curl -s -X POST $BASE/exhibits/$E_ID/confirm-thermostat -H 'Content-Type: application/json' \
  -d "{\"confirmed_by\":\"user_curator_001\"}" > /dev/null
echo "吊装完成 + 恒温柜确认"

echo -e "\n=== 10. 馆长再次确认开幕(应成功) ==="
curl -s -X POST $BASE/exhibitions/$EXH_ID/confirm-opening -H 'Content-Type: application/json' \
  -d "{\"confirmed_by\":\"user_director_001\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('开幕:', d.get('success'), d.get('data',{}).get('read_only') and '(只读)' or '', d.get('error',''))"

echo -e "\n=== 11. 尝试修改只读展区(应失败) ==="
curl -s -X PUT $BASE/exhibitions/$EXH_ID -H 'Content-Type: application/json' \
  -d '{"name":"篡改名字"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('修改展区:', d.get('success'), d.get('error',''))"

echo -e "\n=== 12. 获取完整展区详情 ==="
DETAIL=$(curl -s $BASE/exhibitions/$EXH_ID)
echo "$DETAIL" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print(f\"展区: {d['name']} | 只读: {d['read_only']} | 开幕: {d['opening_confirmed']}\")
print(f\"任务数: {len(d['tasks'])} | 展品数: {len(d['exhibits'])}\")
for t in d['tasks']:
    print(f\"  [任务] {t['name']} | {t['status']} | {t['progress']}% | 前置: {t['dependencies']}\")
for e in d['exhibits']:
    print(f\"  [展品] {e['name']} | 重点:{e['is_key_exhibit']} | 恒温:{e['thermostat_confirmed']}\")
"
echo -e "\n✅ 端到端测试完成"
