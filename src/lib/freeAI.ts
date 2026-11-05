/** Adaptador do Assistente MB para IA 100% local. Sem Worker, Gemini, tokens ou chave. */
import type { User } from 'firebase/auth';

type AIHistory = {role:'user'|'assistant';text:string};
export type FreeAIResponse = {reply:string;command:string|null;remaining:null};
type LocalAI = {
  localModelSupported:()=>boolean;
  localModelReady:()=>boolean;
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

// Consulta de recurso do navegador não produz cobrança por token.
export const isFreeAIConfigured = typeof window !== 'undefined' && window.isSecureContext && Boolean((navigator as Navigator & {gpu?:unknown}).gpu);
export async function loadFreeAI(onProgress?:(text:string)=>void):Promise<void> {
  const local=await module();
  await local.loadLocalModel(onProgress);
}
export async function askFreeAI(_user:User,message:string,history:AIHistory[]=[],onProgress?:(text:string)=>void):Promise<FreeAIResponse> {
  if(!message.trim())throw new Error('Escreva ou fale uma pergunta.');
  const local=await module();
  if(!local.localModelSupported())throw new Error('Este aparelho não suporta WebGPU para a IA local; os comandos diretos continuam disponíveis.');
  if(!local.localModelReady())throw new Error('Clique em “Ativar IA local” antes de fazer perguntas livres.');
  const answer=await local.interpretWithLocalModel(message,history,onProgress);
  return {reply:answer.reply,command:answer.command,remaining:null};
}
