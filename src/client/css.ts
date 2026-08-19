/** Shared scoped stylesheet for the capabilities tabs — rides the host's
 * --dsw-* tokens (same design language as the plugin-inventory and install
 * tabs) so light and dark themes both stay correct. Prefix: dpc-. */

export const CSS = `
.dpc-section{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary)}
.dpc-heading{margin:0;font-size:18px;line-height:26px;font-weight:600}
/* Top-level section's internal tabs — same underline-tab look as the host's
   Plugins section so the promoted placement still reads as one family. */
.dpc-tabs{display:flex;align-items:flex-end;gap:22px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-top:2px}
.dpc-tab{position:relative;border:0;padding:7px 1px 9px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dpc-tab:hover,.dpc-tab[data-active='true']{color:var(--dsw-alias-label-primary)}
.dpc-tab[data-active='true']::after,.dpc-tab:focus-visible::after{position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-label-primary);content:''}
.dpc-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px;color:var(--dsw-alias-label-primary)}
.dpc-tabPanel{min-width:0;padding-top:2px}
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
.dpc-card{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);padding:12px 14px;cursor:pointer}
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
.dpc-textarea{min-height:320px;resize:vertical;font-family:var(--ds-font-family-code);line-height:1.5}
.dpc-textarea[data-short='true']{min-height:96px}
.dpc-input:focus-visible,.dpc-textarea:focus-visible,.dpc-select:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.dpc-checks{display:flex;gap:16px;font-size:13px;line-height:20px}
.dpc-checks label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dpc-formError{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
/* Import dialog: wider than the host's 380px default; the server list gets
   its own scroll so title, intro, and footer stay pinned. The doubled class
   beats the host dialog's module CSS regardless of injection order. */
.dpc-modalWide.dpc-modalWide{width:min(680px,100%)}
/* Editor dialogs (new skill / server): 640px wide so markdown bodies and
   command/arg/env lines stop wrapping mid-token; the content column scrolls
   on short viewports instead of clipping past the dialog edge. */
.dpc-modalForm.dpc-modalForm{width:min(760px,100%)}
.dpc-modalScroll.dpc-modalScroll{max-height:calc(100vh - 160px);overflow-y:auto}
.dpc-mdPreview{min-height:320px;max-height:60vh;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1);font-size:13px}
.dpc-importScroll{display:flex;flex-direction:column;gap:14px;max-height:min(400px,52vh);overflow-y:auto;padding:2px 4px 2px 2px}
.dpc-importGroup{display:flex;flex-direction:column;gap:8px}
.dpc-importHead{display:flex;align-items:center;gap:8px;padding:0 2px}
.dpc-importCount{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dpc-importAll{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}
/* Skills search + source filter chips. */
.dpc-search{width:200px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}
.dpc-search:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dpc-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dpc-chip{border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer}
.dpc-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dpc-chip[data-active='true']{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.dpc-chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
/* Load-policy switch on skill cards (no form semantics — instant apply). */
.dpc-switch{position:relative;flex:none;width:30px;height:18px;border:0;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);cursor:pointer;transition:background .15s}
.dpc-switch[aria-checked='true']{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);box-shadow:none}
.dpc-switchKnob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:left .15s}
.dpc-switch[aria-checked='true'] .dpc-switchKnob{left:14px;background:#fff}
.dpc-switch:disabled{opacity:.55;cursor:default}
.dpc-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
/* Quiet inline link-button (open folder, homepage). */
.dpc-link{border:0;padding:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;text-decoration:none}
.dpc-link:hover{text-decoration:underline}
.dpc-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}
/* Skill repositories list + add form. */
.dpc-rootsHead{margin-top:10px}
.dpc-roots{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.dpc-root{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-3)}
.dpc-rootLabel{flex:none;font-size:13px;line-height:18px;font-weight:600}
.dpc-rootPath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code)}
.dpc-addRoot{border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px}
.dpc-addRootRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dpc-addRootRow .dpc-select{width:auto;flex:none}
.dpc-addRootRow .dpc-input{flex:1;min-width:200px}
/* Market segments + env hint + MCP format preview. */
.dpc-segments{display:inline-flex;gap:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:3px;background:var(--dsw-alias-bg-layer-1)}
.dpc-segment{border:0;border-radius:6px;padding:4px 14px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dpc-segment:hover{color:var(--dsw-alias-label-primary)}
.dpc-segment[data-active='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.dpc-segment:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dpc-envHint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary))}
.dpc-format{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1)}
.dpc-format summary{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dpc-format summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}
.dpc-format .dpc-form{margin-top:8px}
.dpc-formatHint{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dpc-code{margin:4px 0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:8px 10px;overflow-x:auto;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:11px;line-height:17px;white-space:pre}
/* Market detail modal. The host dialog card is a fixed 380px column with no
   scroll, which the long-form intros turn into a clipped strip — widen it
   (doubled selector outranks the module class regardless of style order),
   cap the height, and scroll inside the content region. */
.dpc-marketDialog.dpc-marketDialog{width:min(720px,100%);max-height:calc(100vh - 48px)}
.dpc-marketContent{overflow-y:auto;min-height:0}
.dpc-detailTagsRow{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px}
.dpc-detailDesc{margin:0;font-size:13px;line-height:20px}
.dpc-detailSection{margin-top:14px;display:flex;flex-direction:column;gap:6px}
.dpc-detailLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dpc-detailTags{display:flex;flex-wrap:wrap;gap:4px}
.dpc-skillList{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}
.dpc-skillItem{display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:18px;min-width:0}
.dpc-skillName{font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);white-space:nowrap;flex:none}
.dpc-skillDesc{color:var(--dsw-alias-label-secondary);min-width:0}
@media(max-width:560px){.dpc-skillList{grid-template-columns:minmax(0,1fr)}}
@media(max-width:680px){.dpc-cards{grid-template-columns:minmax(0,1fr)}}
`
