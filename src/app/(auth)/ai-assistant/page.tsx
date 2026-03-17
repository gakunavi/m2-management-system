import { AiAssistantClient } from './_client';

export const metadata = {
  title: 'AIアシスタント',
};

export default function AiAssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AIアシスタント</h1>
        <p className="text-sm text-muted-foreground">
          営業データに関する質問をAIがお答えします
        </p>
      </div>
      <AiAssistantClient />
    </div>
  );
}
