# Builder stage
FROM golang:alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev protobuf-dev

# Install protoc-gen-go and protoc-gen-go-grpc
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
ENV PATH="$PATH:$(go env GOPATH)/bin"

WORKDIR /app

# Copy go mod and sum files
# We accept that context is Root, so we look into server/
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy Proto definitions from server/.protos
COPY server/.protos /tmp/protos

# Copy source code (this moves server/* to /app/*)
# server/.protos (renamed from protos) containing old generated files is also copied
COPY server .

# Generate Auth Protobufs
# We strictly use module=server to match the go.mod module name
# This generates files into .protos/auth/ relative to /app, overwriting old ones
# We only generate auth because index/signaling source is missing but generated files exist
RUN protoc --proto_path=/tmp/protos \
  --go_out=. --go_opt=module=server \
  --go-grpc_out=. --go-grpc_opt=module=server \
  /tmp/protos/auth/auth.proto

# Build services
RUN go build -o /app/bin/gateway ./gateway
RUN go build -o /app/bin/auth ./auth
RUN go build -o /app/bin/index ./index
RUN go build -o /app/bin/signaling ./signaling

# Runner stage
FROM alpine:latest
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Copy binaries
COPY --from=builder /app/bin/gateway .
COPY --from=builder /app/bin/auth .
COPY --from=builder /app/bin/index .
COPY --from=builder /app/bin/signaling .

# Expose ports
EXPOSE 8080 50051 50052 50053

CMD ["/app/gateway"]
