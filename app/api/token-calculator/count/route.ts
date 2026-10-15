import OpenAI from 'openai';
import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/request-session';
import {requireSameOrigin,IngestionError} from '@/lib/service-review/ingestion';
import {boundedJson,InputError} from '@/lib/eassist/transport';
import {supportsPlaygroundModel} from '@/lib/playground-models';
import {usageQuote} from '@/lib/model-usage';
import {currencyRate} from '@/lib/currency-rate';

export const runtime='nodejs';
export async function POST(request:Request) {
 const headers={'Cache-Control':'private, no-store'};
 try {
  const session=await getRequestSession(request);
  if(!session?.user)return Response.json({error:'Sign in to count tokens.'},{status:401,headers});
  requireSameOrigin(request);
  const b=await boundedJson(request);
  if(!b||typeof b!=='object'||Array.isArray(b))throw new InputError('Send a valid calculator request.');
  const {input,model,outputBudget}=b as Record<string,unknown>;
  if(typeof input!=='string'||input.length>50000||typeof model!=='string'||model.length>200||!supportsPlaygroundModel(model)||!Number.isInteger(outputBudget)||Number(outputBudget)<0||Number(outputBudget)>128000)throw new InputError('Choose a text model, input up to 50,000 characters and an output budget from 0 to 128,000 tokens.');
  if(!process.env.OPENAI_API_KEY)throw new InputError('OpenAI token counting is not configured.',503);
  const limit=await db.query(`INSERT INTO token_calculator_limits(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET requests=CASE WHEN token_calculator_limits.window_start<=now()-interval '1 minute' THEN 1 ELSE token_calculator_limits.requests+1 END,window_start=CASE WHEN token_calculator_limits.window_start<=now()-interval '1 minute' THEN now() ELSE token_calculator_limits.window_start END WHERE token_calculator_limits.requests<60 OR token_calculator_limits.window_start<=now()-interval '1 minute' RETURNING requests`,[session.user.id]);
  if(!limit.rowCount)return Response.json({error:'Token counting limit reached. Wait a minute, then retry.'},{status:429,headers:{...headers,'Retry-After':'60'}});
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:15000});
  const result=input.length?await client.responses.inputTokens.count({model,input},{signal:request.signal}):{input_tokens:0};
  if(!Number.isSafeInteger(result.input_tokens)||result.input_tokens<0)throw new Error('Invalid provider count.');
  return Response.json({model,inputTokens:result.input_tokens,outputBudget,checkedAt:new Date().toISOString(),source:'OpenAI Responses input-token count',billing:usageQuote({modelId:model,inputTokens:result.input_tokens,outputTokens:Number(outputBudget),cachedInputTokens:0,cacheWriteTokens:0,serviceTier:'default'},await currencyRate())},{headers});
 }catch(error){
  if(error instanceof InputError || error instanceof IngestionError)return Response.json({error:error.message},{status:error.status,headers});
  return Response.json({error:'OpenAI could not count this input. Check model access or retry. No generated reply was requested.'},{status:502,headers});
 }
}
