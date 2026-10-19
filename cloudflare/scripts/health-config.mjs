export function checkHealthConfig(config){
 const value=config.vars?.LINK_HEALTH_ENABLED;if(value!==undefined&&!["true","false"].includes(value))throw Error("LINK_HEALTH_ENABLED must be true or false.");
 if(value!=="true")return;
 if(!config.compatibility_flags?.includes("global_fetch_strictly_public")||config.compatibility_flags.includes("global_fetch_private_origin"))throw Error("Link monitoring requires strictly public global fetch routing.");
 if(!config.triggers?.crons?.includes("*/5 * * * *"))throw Error("Link monitoring requires its bounded five-minute queue trigger.");
 const origin=new URL(config.vars.PUBLIC_ORIGIN);if(origin.protocol!=="https:"||origin.pathname!=="/"||origin.username||origin.password||origin.search||origin.hash)throw Error("Configure an HTTPS public origin before enabling link monitoring.");
}
