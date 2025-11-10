import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VendorRegistrationForm from "@/components/VendorRegistrationForm";

interface VendorRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

export default function VendorRegistrationModal({
  open,
  onOpenChange,
  title = "Vendor Registration",
  description = "Join our platform to start managing your restaurant with QR ordering",
}: VendorRegistrationModalProps) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!open) {
      setStep(1);
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setStep(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <VendorRegistrationForm
          step={step}
          onStepChange={setStep}
          onClose={() => handleOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

