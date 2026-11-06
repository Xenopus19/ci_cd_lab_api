{{- define "cats.name" -}}
{{- if gt (len .Release.Name) 40 -}}
{{- printf "%s-%s" (.Release.Name | trunc 31 | trimSuffix "-") (.Release.Name | sha256sum | trunc 8) -}}
{{- else -}}
{{- .Release.Name -}}
{{- end -}}
{{- end -}}

{{- define "cats.migrationName" -}}
{{- printf "%s-migrate-%d" (include "cats.name" .) .Release.Revision -}}
{{- end -}}
