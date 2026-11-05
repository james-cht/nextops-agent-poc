<script lang="ts">
  import {
    operatorRoleCapabilityGroups,
  } from '$lib/operator-role-capabilities';
  import { OPERATOR_ROLES, operatorRoleLabel } from '$lib/operator-role';

  const groups = operatorRoleCapabilityGroups();
  const roles = OPERATOR_ROLES;
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">Operator Roles</h2>
  <p class="mt-1 text-[11px] text-fg/30">
    只讀對照：能力來自既有 Operator Role 定義，不是 Runtime Setting，不能勾選。
  </p>

  <div class="mt-4 overflow-x-auto">
    <table class="w-full min-w-[720px] text-left text-[12px]">
      <thead class="text-[11px] uppercase tracking-wide text-muted-strong">
        <tr>
          <th class="pb-2 pr-3 font-medium">能力</th>
          {#each roles as role}
            <th class="pb-2 pr-3 font-medium">{operatorRoleLabel(role)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each groups as group}
          <tr class="border-t border-fg/10">
            <td class="py-2 pr-3 text-[11px] font-medium text-fg/50" colspan={roles.length + 1}>{group.label}</td>
          </tr>
          {#each group.rows as row}
            <tr class="border-t border-fg/[0.04]">
              <td class="py-1.5 pr-3 text-fg/80">{row.label}</td>
              {#each roles as role}
                <td class="py-1.5 pr-3 {row.allowed[role] ? 'text-success' : 'text-fg/30'}">
                  {row.allowed[role] ? '能' : '不能'}
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
</div>
