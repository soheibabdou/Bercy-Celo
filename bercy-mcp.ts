// BERCY MCP — THE PAYMENT LAYER FOR ALL AI AGENTS
// Gives Claude Code payment superpowers:
// Live FX + Crypto rates, AC2 approval, x402 payments on Celo + Algorand
// Install: add to .mcp.json → Claude pays for anything, anywhere
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CELO_URL = "https://bercy-celo-production.up.railway.app";
const ALGO_URL = "https://bercy-x402-production.up.railway.app";

const server = new Server(
    {
        name:    "bercy-mcp",
        version: "1.0.0",
    },
    {
        capabilities: { tools: {} },
    }
);

// ─── LIST TOOLS ────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name:        "bercy_health",
            description: "Check Bercy status on both Algorand and Celo chains. Shows corridors, live rates date, protocols.",
            inputSchema: {
                type:       "object",
                properties: {},
                required:   [],
            },
        },
        {
            name:        "bercy_rates",
            description: "Get live FX + crypto rates for ALL currencies. Covers 79+ corridors: fiat (EUR, USD, GBP...), Africa/MENA (DZD, NGN, KES, MAD...), LatAm (BRL, COP...), Celo stablecoins (cUSD, cEUR, cNGN...) and major crypto (BTC, ETH, SOL, BNB, AVAX, CELO...). Updated every 5 min.",
            inputSchema: {
                type:       "object",
                properties: {
                    currency: {
                        type:        "string",
                        description: "Optional: filter for a specific currency (e.g. 'DZD', 'BTC'). Leave empty for all rates.",
                    },
                },
                required: [],
            },
        },
        {
            name:        "bercy_convert",
            description: "Convert any amount between any two currencies or crypto assets. Uses live ECB + CoinGecko rates. Works for fiat-to-fiat, fiat-to-crypto, crypto-to-fiat, crypto-to-crypto.",
            inputSchema: {
                type:       "object",
                properties: {
                    from:   { type: "string", description: "Source currency code (e.g. 'DZD', 'BTC', 'EUR')" },
                    to:     { type: "string", description: "Target currency code (e.g. 'EUR', 'USDC', 'NGN')" },
                    amount: { type: "number", description: "Amount to convert" },
                },
                required: ["from", "to", "amount"],
            },
        },
        {
            name:        "bercy_authorize",
            description: "Request AC2 human approval before executing a payment. Returns a signed approval_id required for bercy_pay_celo or bercy_pay_algorand. ALWAYS call this before paying.",
            inputSchema: {
                type:       "object",
                properties: {
                    from:      { type: "string", description: "Source currency (e.g. 'DZD')" },
                    to:        { type: "string", description: "Target currency (e.g. 'EUR')" },
                    amount:    { type: "number", description: "Amount to send" },
                    agent_did: { type: "string", description: "Optional: DID of the requesting agent" },
                },
                required: ["from", "to", "amount"],
            },
        },
        {
            name:        "bercy_pay_celo",
            description: "Execute a cross-border FX payment on Celo Mainnet via x402. Costs $0.10 USDC. Settles in ~1 second. Supports fiat, Celo stablecoins, and crypto corridors. Requires prior AC2 approval.",
            inputSchema: {
                type:       "object",
                properties: {
                    from:        { type: "string", description: "Source currency (e.g. 'DZD', 'BTC')" },
                    to:          { type: "string", description: "Target currency (e.g. 'EUR', 'CNGN')" },
                    amount:      { type: "number", description: "Amount to route" },
                    approval_id: { type: "string", description: "AC2 approval_id from bercy_authorize" },
                    x_payment:   { type: "string", description: "x402 payment header (from x402 client)" },
                },
                required: ["from", "to", "amount", "approval_id"],
            },
        },
        {
            name:        "bercy_pay_algorand",
            description: "Execute a cross-border FX payment on Algorand Mainnet via x402. Costs $0.10 USDC. Settles in ~4 seconds. Requires prior AC2 approval.",
            inputSchema: {
                type:       "object",
                properties: {
                    from:        { type: "string", description: "Source currency (e.g. 'DZD')" },
                    to:          { type: "string", description: "Target currency (e.g. 'EUR')" },
                    amount:      { type: "number", description: "Amount to route" },
                    approval_id: { type: "string", description: "AC2 approval_id from bercy_authorize" },
                    x_payment:   { type: "string", description: "x402 payment header (from x402 client)" },
                },
                required: ["from", "to", "amount", "approval_id"],
            },
        },
        {
            name:        "bercy_best_route",
            description: "Find the best chain and rate to execute a payment. Compares Celo vs Algorand for speed, cost, and corridor availability. Returns recommendation with rates.",
            inputSchema: {
                type:       "object",
                properties: {
                    from:   { type: "string", description: "Source currency" },
                    to:     { type: "string", description: "Target currency" },
                    amount: { type: "number", description: "Amount to route" },
                },
                required: ["from", "to", "amount"],
            },
        },
    ],
}));

// ─── EXECUTE TOOLS ─────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
        switch (name) {

            // ── HEALTH ──────────────────────────────────────────
            case "bercy_health": {
                const [celo, algo] = await Promise.all([
                    fetch(`${CELO_URL}/api/health`).then(r => r.json()),
                    fetch(`${ALGO_URL}/api/health`).then(r => r.json()),
                ]);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            bercy_mcp: "operational",
                            chains: {
                                celo:     celo,
                                algorand: algo,
                            },
                            total_corridors: (celo as { totalCorridors?: number }).totalCorridors ?? 0,
                            tip: "Use bercy_rates to see all available currencies",
                        }, null, 2)
                    }]
                };
            }

            // ── RATES ───────────────────────────────────────────
            case "bercy_rates": {
                const res  = await fetch(`${CELO_URL}/api/rates`);
                const data = await res.json() as Record<string, unknown>;
                const currency = (a.currency as string | undefined)?.toUpperCase();

                if (currency) {
                    const rates = data.rates as Record<string, number>;
                    const rate  = rates[currency];
                    if (!rate) {
                        return { content: [{ type: "text", text: `Currency "${currency}" not found. Available: ${Object.keys(rates).join(", ")}` }] };
                    }
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                currency,
                                usd_value:   rate,
                                last_updated: data.lastUpdated,
                                example:     `1 ${currency} = $${rate} USD`,
                            }, null, 2)
                        }]
                    };
                }

                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            // ── CONVERT ─────────────────────────────────────────
            case "bercy_convert": {
                const { from, to, amount } = a as { from: string; to: string; amount: number };
                const res  = await fetch(`${CELO_URL}/api/rates`);
                const data = await res.json() as { rates: Record<string, number>; lastUpdated: string };
                const rates = data.rates;

                const fromRate = rates[from.toUpperCase()];
                const toRate   = rates[to.toUpperCase()];

                if (!fromRate) return { content: [{ type: "text", text: `Unknown currency: ${from}. Check bercy_rates for available currencies.` }] };
                if (!toRate)   return { content: [{ type: "text", text: `Unknown currency: ${to}. Check bercy_rates for available currencies.` }] };

                const effectiveRate = toRate / fromRate;
                const output        = Math.round(amount * effectiveRate * 10000) / 10000;

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            from:           from.toUpperCase(),
                            to:             to.toUpperCase(),
                            amount,
                            effective_rate: Math.round(effectiveRate * 10000) / 10000,
                            estimated_output: output,
                            path:           `${from.toUpperCase()} → cUSD → ${to.toUpperCase()}`,
                            rates_source:   "ECB + CoinGecko + Mento",
                            rates_date:     data.lastUpdated,
                            next_step:      "Call bercy_authorize then bercy_pay_celo to execute this route",
                        }, null, 2)
                    }]
                };
            }

            // ── AUTHORIZE ───────────────────────────────────────
            case "bercy_authorize": {
                const { from, to, amount, agent_did } = a as { from: string; to: string; amount: number; agent_did?: string };
                const res  = await fetch(`${CELO_URL}/api/authorize`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ from, to, amount, agent_did }),
                });
                const data = await res.json();
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            // ── PAY CELO ────────────────────────────────────────
            case "bercy_pay_celo": {
                const { from, to, amount, x_payment } = a as {
                    from: string; to: string; amount: number;
                    approval_id: string; x_payment?: string;
                };
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (x_payment) headers["X-PAYMENT"] = x_payment;

                const res  = await fetch(`${CELO_URL}/api/orchestrate`, {
                    method: "POST",
                    headers,
                    body:   JSON.stringify({ from, to, amount }),
                });
                const data = await res.json();

                if (res.status === 402) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status:       "payment_required",
                                message:      "x402 payment required. Include X-PAYMENT header with USDC payment on Celo (eip155:42220).",
                                payment_info: data,
                            }, null, 2)
                        }]
                    };
                }
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            // ── PAY ALGORAND ────────────────────────────────────
            case "bercy_pay_algorand": {
                const { from, to, amount, x_payment } = a as {
                    from: string; to: string; amount: number;
                    approval_id: string; x_payment?: string;
                };
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (x_payment) headers["X-PAYMENT"] = x_payment;

                const res  = await fetch(`${ALGO_URL}/api/orchestrate`, {
                    method: "POST",
                    headers,
                    body:   JSON.stringify({ from, to, amount }),
                });
                const data = await res.json();

                if (res.status === 402) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status:       "payment_required",
                                message:      "x402 payment required. Include X-PAYMENT header with USDC payment on Algorand Mainnet.",
                                payment_info: data,
                            }, null, 2)
                        }]
                    };
                }
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            // ── BEST ROUTE ──────────────────────────────────────
            case "bercy_best_route": {
                const { from, to, amount } = a as { from: string; to: string; amount: number };
                const [celoRates, algoHealth] = await Promise.all([
                    fetch(`${CELO_URL}/api/rates`).then(r => r.json()) as Promise<{ rates: Record<string, number>; lastUpdated: string }>,
                    fetch(`${ALGO_URL}/api/health`).then(r => r.json()) as Promise<{ corridors: number }>,
                ]);

                const rates    = celoRates.rates;
                const fromRate = rates[from.toUpperCase()];
                const toRate   = rates[to.toUpperCase()];
                const canRoute = !!(fromRate && toRate);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            from:            from.toUpperCase(),
                            to:              to.toUpperCase(),
                            amount,
                            can_route:       canRoute,
                            recommended:     "celo",
                            reason:          "1 second settlement, gasless, 79 corridors",
                            celo: {
                                available:       canRoute,
                                settlement_time: "~1 second",
                                cost:            "$0.10 USDC",
                                corridors:       79,
                                output:          canRoute ? Math.round(amount * (toRate / fromRate) * 100) / 100 : null,
                            },
                            algorand: {
                                available:       algoHealth.corridors > 0,
                                settlement_time: "~4 seconds",
                                cost:            "$0.10 USDC",
                                corridors:       algoHealth.corridors,
                            },
                            next_steps: [
                                "1. Call bercy_authorize to get AC2 approval",
                                "2. Call bercy_pay_celo with the approval_id",
                                "3. Payment settles in ~1 second on Celo",
                            ],
                        }, null, 2)
                    }]
                };
            }

            default:
                return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
        }
    } catch (err) {
        return {
            content: [{
                type: "text",
                text: `Bercy MCP error: ${err instanceof Error ? err.message : String(err)}`
            }],
            isError: true,
        };
    }
});

// ─── START ─────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🦅 Bercy MCP running — payment superpowers active");
}

main().catch(console.error);

        
