import { Big } from 'math';

Deno.serve((req: Request) => {
  const big = new Big(0.1).plus(0.2).toString();
  const envKey1 = Deno.env.get('KEY1');
  const envKey2 = Deno.env.get('KEY2');
  return new Response(`Hello, world! ${envKey1} ${envKey2} ${big}`);
});
