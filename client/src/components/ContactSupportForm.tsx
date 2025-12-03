import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function ContactSupportForm() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in your name and message.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          subject: subject.trim() || "Support request",
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to submit request");
      }

      toast({
        title: "Request sent",
        description: "Our team will get back to you shortly.",
      });

      setName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <CardTitle>Contact Support</CardTitle>
        <CardDescription>
          Have questions or need help? Send us a message and we&apos;ll respond as soon as possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-subject">Subject</Label>
              <Input
                id="contact-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="How can we help?"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-message">Message *</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe your question or issue..."
              rows={4}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


