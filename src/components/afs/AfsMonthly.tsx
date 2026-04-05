import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AfsMonthlyProps {
  selectedDate: string;
}

export function AfsMonthly({ selectedDate }: AfsMonthlyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AFS Monthly</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">AFS Monthly reporting will be configured here.</p>
      </CardContent>
    </Card>
  );
}
