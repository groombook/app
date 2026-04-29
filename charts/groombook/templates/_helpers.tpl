{{/*
Expand the name of the chart.
*/}}
{{- define "groombook.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "groombook.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "groombook.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "groombook.labels" -}}
helm.sh/chart: {{ include "groombook.chart" . }}
{{ include "groombook.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "groombook.selectorLabels" -}}
app.kubernetes.io/name: {{ include "groombook.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component labels (extends common labels with component name)
*/}}
{{- define "groombook.componentLabels" -}}
{{ include "groombook.labels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Component selector labels
*/}}
{{- define "groombook.componentSelectorLabels" -}}
{{ include "groombook.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "groombook.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "groombook.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
API image reference
*/}}
{{- define "groombook.apiImage" -}}
{{- printf "%s:%s" .Values.api.image.repository (default .Chart.AppVersion .Values.api.image.tag) }}
{{- end }}

{{/*
Web image reference
*/}}
{{- define "groombook.webImage" -}}
{{- printf "%s:%s" .Values.web.image.repository (default .Chart.AppVersion .Values.web.image.tag) }}
{{- end }}

{{/*
Migrate image reference
*/}}
{{- define "groombook.migrateImage" -}}
{{- printf "%s:%s" .Values.migrate.image.repository (default .Chart.AppVersion .Values.migrate.image.tag) }}
{{- end }}

{{/*
Database URL — differs by postgresql.mode
Integrated: construct from chart-managed PostgreSQL credentials
Operator: read from credentialsSecret
*/}}
{{- define "groombook.databaseSecretName" -}}
{{- if eq .Values.postgresql.mode "operator" }}
{{- required "postgresql.operator.credentialsSecret is required in operator mode" .Values.postgresql.operator.credentialsSecret }}
{{- else }}
{{- include "groombook.fullname" . }}-db-credentials
{{- end }}
{{- end }}

{{/*
Database URL secret key
*/}}
{{- define "groombook.databaseSecretKey" -}}
{{- if eq .Values.postgresql.mode "operator" -}}
uri
{{- else -}}
database-url
{{- end -}}
{{- end }}

{{/*
Auth secret name — always use groombook-auth (sealed secret name)
*/}}
{{- define "groombook.authSecretName" -}}
{{- printf "%s" "groombook-auth" }}
{{- end }}
