/** Shared scoped stylesheet for the capabilities tabs — rides the host's
 * --dsw-* tokens (same design language as the plugin-inventory and install
 * tabs) so light and dark themes both stay correct. Prefix: dpc-. */

export const CSS = `
.dpc-section{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary)}
.dpc-head{display:flex;align-items:center;gap:8px}
.dpc-head h3{margin:0;font-size:13px;line-height:20px;font-weight:600}
.dpc-head>svg{flex:none;color:var(--dsw-alias-label-tertiary)}
.dpc-intro{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dpc-listHead{display:flex;align-items:baseline;gap:7px;padding:0 2px;margin-top:2px}
.dpc-listHead h3{margin:0;font-size:13px;line-height:20px;font-weight:600}
.dpc-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dpc-spacer{flex:1}
.dpc-refresh{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dpc-refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dpc-refresh:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dpc-empty{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dpc-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:10px;margin:0;padding:0;list-style:none}
.dpc-card{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);padding:12px 14px}
.dpc-card:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dpc-cardTop{display:flex;align-items:center;gap:8px}
.dpc-cardTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:600;font-family:var(--ds-font-family-code)}
.dpc-cardDesc{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dpc-cardRow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dpc-tag{display:inline-flex;align-items:center;min-height:20px;border-radius:5px;padding:1px 6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}
.dpc-tag[data-kind='source']{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.dpc-tag[data-kind='off']{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-tertiary)) 12%,transparent);color:var(--dsw-alias-label-secondary)}
.dpc-cardActions{display:flex;align-items:center;gap:6px;margin-left:auto}
.dpc-banner{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;background:var(--dsw-alias-bg-layer-3);font-size:13px;line-height:20px}
.dpc-banner[data-kind='ok']{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent)}
.dpc-banner[data-kind='error']{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dpc-banner[data-kind='info']{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}
.dpc-bannerBody{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dpc-bannerHint{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dpc-form{display:flex;flex-direction:column;gap:10px}
.dpc-label{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dpc-label>span:first-child{color:var(--dsw-alias-label-tertiary)}
.dpc-input,.dpc-textarea,.dpc-select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dpc-textarea{min-height:120px;resize:vertical;font-family:var(--ds-font-family-code);line-height:1.5}
.dpc-textarea[data-short='true']{min-height:64px}
.dpc-input:focus-visible,.dpc-textarea:focus-visible,.dpc-select:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.dpc-checks{display:flex;gap:16px;font-size:13px;line-height:20px}
.dpc-checks label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dpc-formError{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
/* Import dialog: wider than the host's 380px default; the server list gets
   its own scroll so title, intro, and footer stay pinned. The doubled class
   beats the host dialog's module CSS regardless of injection order. */
.dpc-modalWide.dpc-modalWide{width:min(680px,100%)}
.dpc-importScroll{display:flex;flex-direction:column;gap:14px;max-height:min(400px,52vh);overflow-y:auto;padding:2px 4px 2px 2px}
.dpc-importGroup{display:flex;flex-direction:column;gap:8px}
.dpc-importHead{display:flex;align-items:center;gap:8px;padding:0 2px}
.dpc-importCount{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dpc-importAll{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}
@media(max-width:680px){.dpc-cards{grid-template-columns:minmax(0,1fr)}}
`
