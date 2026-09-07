import { Card } from '../components';
import { AgentView } from './agent-view';

export default function AgentPage() {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Buyer agent — decision log</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-2)]">
          Every tool call the procurement agent makes — discovery, ranking, payment, feedback — streamed live as it happens.
        </p>
        <Card className="mt-3 max-w-2xl p-3 text-xs text-[var(--ink-2)]">
          <strong className="text-[var(--ink)]">What you&apos;re looking at:</strong> a real Claude model, given a task in
          plain English (e.g. &quot;buy market intel and leave feedback&quot;), decides on its own which provider to use,
          spends real testnet money, and writes a review on-chain. Each card below is one tool call it chose to make —
          this is not a scripted replay.
        </Card>
      </section>
      <AgentView />
    </div>
  );
}
