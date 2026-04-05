import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AfsJournalEntriesProps {
  selectedDate: string;
}

export function AfsJournalEntries({ selectedDate }: AfsJournalEntriesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Journal Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Journal entries for AFS will be configured here.</p>
      </CardContent>
    </Card>
  );
}
