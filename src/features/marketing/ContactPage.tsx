import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContentPage } from "@/features/marketing/ContentPage";
import { useState } from "react";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  company: z.string().trim().optional(),
  message: z.string().trim().min(10, "Please include a short message"),
});

type ContactValues = z.infer<typeof contactSchema>;

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", company: "", message: "" },
  });

  const onSubmit = form.handleSubmit(() => {
    // Contact delivery backend arrives with notifications/ops integrations.
    setSubmitted(true);
  });

  return (
    <ContentPage
      title="Contact"
      description="Tell us about your sales workflow. Enterprise and partnership enquiries are welcome."
    >
      {submitted ? (
        <div className="max-w-xl rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Message captured locally</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your form validated successfully. Outbound contact delivery will connect when the notification provider is
            configured — this screen does not pretend an email was sent.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="max-w-xl space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" {...form.register("company")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" {...form.register("message")} />
            {form.formState.errors.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
            ) : null}
          </div>
          <Button type="submit">Submit</Button>
        </form>
      )}
    </ContentPage>
  );
}
