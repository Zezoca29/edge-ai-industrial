package com.edgeai.industrial.service;

import java.util.UUID;

/** Published after an alert row is committed, so notification never blocks ingestion. */
public record AlertOpenedEvent(UUID alertId, UUID storeId, String title, String body) {
}
