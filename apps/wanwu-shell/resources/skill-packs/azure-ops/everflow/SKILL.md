---
name: everflow
description: 为 Azure 网络故障排查准备 Everflow 抓包配置。涵盖 VM-to-VM、SLB（含 AppGW/AzFW）、ILB、ExpressRoute（Circuit/ERGW）、VPN Gateway、Global Peering 以及东西向 Fast Path 等 8 种场景。根据用户描述自动匹配场景，通过 Kusto MCP 跨集群查询定位 TOR 设备和生成 Everflow filter 规则。查询中请使用 Kusto MCP 查询。
---

# Everflow 抓包准备技能

为 Azure 网络问题排查快速生成 Everflow 抓包配置：自动查询 TOR 设备、PA/NodeIp 地址，并输出可直接使用的 filter 规则。

## 场景路由

根据用户描述匹配最合适的子场景文件：

| 场景文件 | 适用情况 | 触发词 |
|---|---|---|
| [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) | 两台 VM 之间的互通/丢包/延迟 | everflow、抓包、VM to VM、TOR 查询 |
| [`everflow-slb.md`](./everflow-slb.md) | SLB 公网入流量；AppGW / AzFW 前端 VIP 入流量 | SLB 抓包、VIP 抓包、AppGW 抓包、AzFW 抓包、Mux 抓包 |
| [`everflow-ilb.md`](./everflow-ilb.md) | 内部负载均衡器（ILB）流量，含 Fast Path | ILB 抓包、内部 LB 抓包、ILB Fast Path |
| [`everflow-ercircuit.md`](./everflow-ercircuit.md) | ER 专线 MSEE 子接口抓包（onprem↔Azure 双向） | ER circuit、ER 专线抓包、MSEE 抓包、专线子接口 |
| [`everflow-ergw.md`](./everflow-ergw.md) | ERGW 入流量（Mux→ERGW 实例封装段） | ERGW 抓包、ERGW VIP、专线网关抓包 |
| [`everflow-vpngw.md`](./everflow-vpngw.md) | VPN Gateway（S2S/P2S）入流量 | VPNGW 抓包、VPN Gateway 抓包、S2S VPN 抓包 |
| [`everflow-global-peering.md`](./everflow-global-peering.md) | 跨区域 VNet Peering（IPv6 underlay） | global peering、跨区域 peering、跨 region VM |
| [`everflow-slb-eastwest-fastpath.md`](./everflow-slb-eastwest-fastpath.md) | 东西向 SLB Fast Path（首包 Mux + 后续直通） | SLB fast path、东西向 Everflow、bypass mux |

## 使用流程

1. **识别场景**：根据用户描述的故障现象和网络架构，选择最匹配的子场景文件
2. **读取子场景 SKILL.md**：用 `read` 读取对应子场景文件，获取完整的查询逻辑、参数说明和 Kusto 模板
3. **收集参数**：确认必需的参数（subscriptionId、资源 ID、IP 地址等）
4. **执行 Kusto 查询**：按子场景文件中的 SQL/KQL 模板，使用 Kusto MCP 执行跨集群查询
5. **输出结果**：生成 TOR 设备列表和 Everflow filter JSON，供用户部署抓包

## 通用说明

- 所有查询默认时间范围为 `endTime - 2d` 到 `now()`，用户可指定 `startTime` / `endTime`（UTC ISO 8601）
- 查询涉及多个 Kusto 集群：`aznwmds`、`azslbmc`、`azurecm`、`azcrpmc`、`argmcn2nrpone` 等
- 生成的 filter 支持多种聚合粒度（`/32` 精确、`/24` 子网、`/16` 大聚合），方便按抓包系统规则上限选择
- 下载抓包文件可使用 [`everflow_download.ps1`](./everflow_download.ps1) 脚本

## 注意事项

- ⚠️ ERGW 只有入向流量，不生成反向规则
- ⚠️ ER Circuit 在 MSEE 子接口上能看到双向流量，filter 需正反两条规则
- ⚠️ ILB Fast Path 后续报文走宿主机 PA 直连，需用宿主机 PA 而非 VM 内网 CA
- ⚠️ Global Peering 跨区域流量走 IPv6 underlay，filter 必须用 `VA_PRIMARY_PA_V6`
- ✅ AppGW / AzFW 的前端 VIP 本质是 SLB VIP，直接用 `everflow-slb` 场景即可
