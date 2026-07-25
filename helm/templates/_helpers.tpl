{{- define "harvestledger.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: harvestledger
{{- end -}}
