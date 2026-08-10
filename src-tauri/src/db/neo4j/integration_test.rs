//! Test de integración real contra un Neo4j en contenedor (testcontainers).
//! Requiere Docker; se omite por defecto: `cargo test -- --ignored`.

use crate::db::neo4j::driver::Neo4jDriver;
use crate::db::{DbDriver, GraphDriver};
use testcontainers::core::IntoContainerPort;
use testcontainers::core::WaitFor;
use testcontainers::runners::AsyncRunner;
use testcontainers::{GenericImage, ImageExt};

#[tokio::test]
#[ignore = "requires Docker (neo4j:5-community)"]
async fn ping_and_execute_cypher_against_real_neo4j() {
    let container = GenericImage::new("neo4j", "5-community")
        .with_exposed_port(7687.tcp())
        .with_wait_for(WaitFor::message_on_stdout("Started."))
        .with_env_var("NEO4J_AUTH", "neo4j/password")
        .start()
        .await
        .expect("failed to start neo4j container");

    let host = container
        .get_host()
        .await
        .expect("failed to resolve container host");
    let port = container
        .get_host_port_ipv4(7687)
        .await
        .expect("failed to resolve bolt port");

    let uri = format!("bolt://{}:{}", host, port);
    let driver = Neo4jDriver::new(&uri, "neo4j", Some("password"), Some("neo4j"), None)
        .await
        .expect("failed to connect to neo4j");

    driver.verify_connectivity().await.expect("ping failed");

    let graph = driver
        .execute_cypher(
            "CREATE (n:TestNode {name: $0}) RETURN n",
            &[Some("hello".to_string())],
        )
        .await
        .expect("cypher execution failed");

    assert!(
        !graph.nodes.is_empty(),
        "expected at least one node returned by CREATE ... RETURN n"
    );
    assert_eq!(
        graph.nodes[0].labels,
        vec!["TestNode".to_string()],
        "node label mismatch"
    );

    DbDriver::close(&driver).await.expect("close failed");
}
