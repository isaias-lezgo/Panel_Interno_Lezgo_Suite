"use client"

import { Instrument } from "@/components/panel/page-header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Voice } from "@/data/lezgo-ia"

/** Cómo se presenta la IA ante el equipo y cómo le habla al asesor. */
export function VoiceSettings({
  voice,
  onChange,
}: {
  voice: Voice
  onChange: (patch: Partial<Voice>) => void
}) {
  return (
    <Instrument
      label="Tono y voz"
      hint="Cómo se presenta ante el equipo y si le habla de tú o de usted al asesor"
    >
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="voice-name">Se presenta como</Label>
          <Input
            id="voice-name"
            value={voice.agentName}
            onChange={(e) => onChange({ agentName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voice-formality">Trato con el asesor</Label>
          <Select
            value={voice.formality}
            onValueChange={(v) => onChange({ formality: (v ?? "tu") as Voice["formality"] })}
          >
            <SelectTrigger id="voice-formality" className="w-full">
              <SelectValue>
                {(v: string) => (v === "usted" ? "De usted" : "De tú")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tu">De tú</SelectItem>
              <SelectItem value="usted">De usted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Instrument>
  )
}
