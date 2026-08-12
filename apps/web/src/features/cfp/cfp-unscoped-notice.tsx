import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function CfpUnscopedNotice() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <Alert>
        <AlertTitle>This CFP link is incomplete</AlertTitle>
        <AlertDescription>
          Ask the event organizer for the full application link. It includes both the organization
          and event.
        </AlertDescription>
      </Alert>
    </main>
  );
}
