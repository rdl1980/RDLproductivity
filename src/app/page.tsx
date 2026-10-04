import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">RDL Productivity</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Il tuo Trello personale: board, liste e card. Le board arrivano con la Milestone 2.
      </p>
      <Button disabled>Le mie board</Button>
    </main>
  );
}
