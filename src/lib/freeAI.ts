/** Adaptador do Assistente MB para IA local GPU/CPU. Sem APIs cobradas por uso. */
import type { User } from 'firebase/auth';

type AIHistory = {role:'user'|'assistant';text:string};
export type FreeAIResponse = {reply:string;command:string|null;remaining:null};
export type FreeAIMode = 'gpu' | 'cpu';
type LocalAI = {
  localModelSupported:()=>boolean;
  localModelReady:()=>boolean;
  localModelBackend:()=>FreeAIMode|null;
  loadLocalModel:(onProgress?:(text:string)=>void)=>Promise<unknown>;
  interpretWithLocalModel:(message:string,history:AIHistory[],onProgress?:(text:string)=>void)=>Promise<{reply:string;command:string|null}>;
};

const base = import.meta.env.BASE_URL || '/';
const filePath = `${base}local-model.js`;
let loading:Promise<LocalAI>|null=null;
async function module():Promise<LocalAI> {
  if(!loading)loading=import(/* @vite-ignore */ filePath) as Promise<LocalAI>;
  return loading;
}

// HTTPS + WebAssembly: CPU funciona mesmo quando WebGPU não está disponível.
export const isFreeAIConfigured = typeof window !== 'undefined' && window.isSecureContext && typeof WebAssembly !== 'undefined';
export async function loadFreeAI(onProgress?:(text:string)=>void):Promise<FreeAIMode> {
  const local=await module();
  await local.loadLocalModel(onProgress);
  return local.localModelBackend() || 'cpu';
}
export async function askFreeAI(_user:User,message:string,history:AIHistory[]=[],onProgress?:(text:string)=>void):Promise<FreeAIResponse> {
  if(!message.trim())throw new Error('Escreva ou fale uma pergunta.');
  const local=await module();
  if(!local.localModelSupported())throw new Error('IA local exige HTTPS e WebAssembly. Os comandos diretos continuam disponíveis.');
  if(!local.localModelReady())throw new Error('Clique em “Ativar IA local” antes de fazer perguntas livres.');
  const answer=await local.interpretWithLocalModel(message,history,onProgress);
  return {reply:answer.reply,command:answer.command,remaining:null};
}
