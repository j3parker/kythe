load("//tools:build_rules/go.bzl", "go_package_library")

package(default_visibility = ["//kythe:default_visibility"])

go_package_library(
    name = "inmemory",
    srcs = ["inmemory.go"],
    deps = [
        "//kythe/go/services/graphstore",
        "//kythe/go/services/graphstore/compare",
        "//kythe/proto:storage_proto_go",
        "@go_protobuf//:proto",
    ],
)
