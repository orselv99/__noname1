FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build services
# Each service specific build command
RUN go build -o /app/bin/gateway ./gateway
RUN go build -o /app/bin/auth ./auth
RUN go build -o /app/bin/index-service ./index
RUN go build -o /app/bin/signaling ./signaling

# Final Stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies (if any)
RUN apk add --no-cache ca-certificates

# Copy binaries from builder
COPY --from=builder /app/bin/gateway /app/gateway
COPY --from=builder /app/bin/auth /app/auth
COPY --from=builder /app/bin/index-service /app/index-service
COPY --from=builder /app/bin/signaling /app/signaling

# Copy any necessary config files or assets? (Maybe .env if hardcoded but handled by docker-compose)

# Create a startup script (optional, or override CMD in docker-compose)
CMD ["/app/gateway"]
