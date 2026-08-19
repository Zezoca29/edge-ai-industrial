package com.edgeai.industrial.dto;

public record PushSubscriptionDto(String endpoint, String p256dh, String auth) {
}
